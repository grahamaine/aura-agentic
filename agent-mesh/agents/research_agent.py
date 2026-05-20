"""
ResearchAgent — Specialist for web research and fact-finding.

Uses Claude with web-search capability to gather information,
then returns structured findings that other agents can consume.
"""

import asyncio
import json
import time
from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus

SYSTEM_PROMPT = """You are ResearchAgent, a specialist AI agent in the AgentMesh protocol on Somnia blockchain.
You excel at thorough research, finding reliable sources, and synthesising information clearly.

When given a research task:
1. Identify the key questions to answer
2. Gather comprehensive information on each question
3. Cite sources where possible (URLs, paper titles, etc.)
4. Structure your output as clear, factual findings

Your output will be used by other agents (analysts, code generators), so be precise and structured.
Format: Start with a summary, then detailed findings, then sources."""

RESEARCH_PROMPT = """Research Task: {title}

Description: {description}

Specific Input/Context: {input_data}

Expected Output Format: {expected_output}

Conduct thorough research and provide comprehensive findings.
Include concrete facts, data points, and sources where possible."""


class ResearchAgent(BaseAgent):

    def __init__(self, config: AgentConfig):
        config.capabilities = [Capability.Research, Capability.DataFetch]
        super().__init__(config)
        self._active_tasks: set[int] = set()

    async def execute_task(self, task: dict) -> str:
        self.log.info(f"Researching: {task['title']}")

        input_data = {}
        try:
            input_data = json.loads(task["inputData"])
        except Exception:
            input_data = {"input": task["inputData"], "expected_output": "comprehensive research"}

        prompt = RESEARCH_PROMPT.format(
            title=task["title"],
            description=task["description"],
            input_data=input_data.get("input", task["inputData"]),
            expected_output=input_data.get("expected_output", "Structured research findings"),
        )

        result = self.think(SYSTEM_PROMPT, prompt, max_tokens=4096)
        self.stats["tasks_completed"] += 1
        self.log.info(f"Research complete for task #{task['id']}")
        return result

    async def _check_assigned_tasks(self):
        try:
            count = await self._market.functions.taskCount().call()
            for tid in range(1, count + 1):
                if tid in self._active_tasks:
                    continue
                t = await self.get_task(tid)
                if (t["assignedAgent"].lower() == self.address.lower() and
                        t["status"] in (int(TaskStatus.Assigned), int(TaskStatus.InProgress))):
                    self._active_tasks.add(tid)
                    asyncio.create_task(self._run_task(tid, t))
        except Exception as e:
            self.log.error(f"Poll error: {e}")

    async def _run_task(self, task_id: int, task: dict):
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: self.execute_task(task))
            if asyncio.iscoroutine(result):
                result = await result
            result_hash = json.dumps({"result": result[:2000], "agent": self.address, "type": "research"})
            await self.submit_result(task_id, result_hash)
        except Exception as e:
            self.log.error(f"Task #{task_id} failed: {e}")
        finally:
            self._active_tasks.discard(task_id)
