"""
OrchestratorAgent — The brain of AgentMesh.

Receives a complex user task, uses Claude to decompose it into sub-tasks,
posts each sub-task on-chain (with a slice of the reward), monitors completion,
then synthesizes a final answer.

This agent's superpower: it treats the Somnia blockchain as a job scheduler,
creating a fully auditable, decentralised task pipeline.
"""

import asyncio
import json
import time
from typing import Any

from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus


SYSTEM_PROMPT = """You are the OrchestratorAgent in the AgentMesh protocol on Somnia blockchain.
Your job is to decompose complex tasks into atomic sub-tasks for specialist agents.

Available specialist agent types and their capabilities:
- ResearchAgent (cap=0): Web research, fact-finding, source gathering
- CodeAgent (cap=1): Code generation, debugging, algorithm design
- AnalysisAgent (cap=2): Data analysis, summarisation, pattern recognition
- DataFetchAgent (cap=5): External API calls, data retrieval

Rules:
1. Break the task into 2-4 parallel or sequential sub-tasks
2. Assign each sub-task to exactly ONE capability type
3. Specify clear input/output contracts between sub-tasks
4. Allocate reward_fraction (must sum to ~0.85 — 15% kept for orchestration)

Return ONLY valid JSON, no markdown fences."""

DECOMPOSE_PROMPT = """Decompose this task into sub-tasks for specialist agents:

TASK TITLE: {title}
TASK DESCRIPTION: {description}
INPUT DATA: {input_data}
TOTAL REWARD: {reward_stt} STT

Return JSON:
{{
  "reasoning": "why you split this way",
  "subtasks": [
    {{
      "title": "short title",
      "description": "detailed description",
      "input": "what data/context this sub-task receives",
      "expected_output": "what format/content to return",
      "capability": 0,
      "reward_fraction": 0.25,
      "depends_on": []
    }}
  ],
  "synthesis_instructions": "how to combine sub-task outputs into final answer"
}}"""

SYNTHESIZE_PROMPT = """You are synthesizing results from specialist agents into a final deliverable.

ORIGINAL TASK: {title}
{description}

SUB-TASK RESULTS:
{results}

SYNTHESIS INSTRUCTIONS: {instructions}

Produce the final, high-quality deliverable. Be comprehensive and well-structured."""


class OrchestratorAgent(BaseAgent):

    def __init__(self, config: AgentConfig):
        super().__init__(config)
        self._active_orchestrations: dict[int, dict] = {}

    async def _should_bid(self, task: dict) -> bool:
        # Only bid on tasks with >0.001 STT reward (enough to fund sub-tasks)
        return task["reward"] > int(1e15)

    async def execute_task(self, task: dict) -> str:
        task_id = task["id"]
        self.log.info(f"Orchestrating task #{task_id}: {task['title']}")

        # 1. Decompose with Claude
        plan = self._decompose(task)
        self.log.info(f"Plan: {len(plan['subtasks'])} sub-tasks")

        # 2. Post sub-tasks on-chain
        sub_task_ids = []
        for st in plan["subtasks"]:
            reward_wei = int(task["reward"] * st["reward_fraction"])
            deadline = int(time.time()) + 300  # 5-min sub-task deadline

            fn = self._market.functions.postSubTask(
                task_id,
                st["title"],
                st["description"],
                json.dumps({"input": st["input"], "expected_output": st["expected_output"]}),
                st["capability"],
                deadline,
            )
            tx = await self._send_tx(fn, value_wei=reward_wei)
            sub_id = await self._get_last_task_id()
            sub_task_ids.append(sub_id)
            self.log.info(f"Sub-task #{sub_id} posted: {st['title']}")

        # 3. Wait for sub-tasks to complete (with timeout)
        results = await self._wait_for_subtasks(sub_task_ids, timeout=600)

        # 4. Synthesize final answer
        final = self._synthesize(task, results, plan["synthesis_instructions"])

        self.stats["tasks_completed"] += 1
        return final

    def _decompose(self, task: dict) -> dict:
        reward_stt = task["reward"] / 1e18
        prompt = DECOMPOSE_PROMPT.format(
            title=task["title"],
            description=task["description"],
            input_data=task["inputData"],
            reward_stt=f"{reward_stt:.6f}",
        )
        raw = self.think(SYSTEM_PROMPT, prompt, max_tokens=2048)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: single sub-task passthrough
            return {
                "reasoning": "Fallback single-task",
                "subtasks": [{
                    "title": task["title"],
                    "description": task["description"],
                    "input": task["inputData"],
                    "expected_output": "Best answer possible",
                    "capability": task["requiredCapability"],
                    "reward_fraction": 0.8,
                    "depends_on": [],
                }],
                "synthesis_instructions": "Return the result directly.",
            }

    async def _get_last_task_id(self) -> int:
        count = await self._market.functions.taskCount().call()
        return count

    async def _wait_for_subtasks(
        self, sub_task_ids: list[int], timeout: int = 600
    ) -> dict[int, str]:
        results = {}
        deadline = time.time() + timeout
        while time.time() < deadline and len(results) < len(sub_task_ids):
            for tid in sub_task_ids:
                if tid in results:
                    continue
                t = await self.get_task(tid)
                if t["status"] == int(TaskStatus.Completed):
                    results[tid] = t["resultHash"]
                    self.log.info(f"Sub-task #{tid} completed")
            await asyncio.sleep(3)
        return results

    def _synthesize(self, task: dict, results: dict, instructions: str) -> str:
        results_str = "\n\n".join(
            f"Sub-task #{tid}:\n{res}" for tid, res in results.items()
        )
        prompt = SYNTHESIZE_PROMPT.format(
            title=task["title"],
            description=task["description"],
            results=results_str,
            instructions=instructions,
        )
        return self.think(
            "You are a synthesis agent. Produce the final deliverable.",
            prompt,
            max_tokens=8192,
        )

    async def _check_assigned_tasks(self):
        """Poll for tasks assigned to us and execute them."""
        try:
            all_ids = list(range(1, await self._market.functions.taskCount().call() + 1))
            for tid in all_ids:
                if tid in self._active_orchestrations:
                    continue
                t = await self.get_task(tid)
                if (t["assignedAgent"].lower() == self.address.lower() and
                        t["status"] in (int(TaskStatus.Assigned), int(TaskStatus.InProgress))):
                    self._active_orchestrations[tid] = t
                    asyncio.create_task(self._run_task(tid, t))
        except Exception as e:
            self.log.error(f"Check assigned error: {e}")

    async def _run_task(self, task_id: int, task: dict):
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.execute_task(task)
            )
            # Store result as inline JSON (in production: IPFS hash)
            result_hash = json.dumps({"result": result[:1000], "agent": self.address})
            await self.submit_result(task_id, result_hash)
        except Exception as e:
            self.log.error(f"Task #{task_id} execution failed: {e}")
        finally:
            self._active_orchestrations.pop(task_id, None)
