"""
AnalysisAgent — Specialist for data analysis, summarization, and pattern recognition.

Takes raw data or research findings and produces structured insights,
comparisons, risk assessments, and recommendations.
"""

import asyncio
import json
from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus

SYSTEM_PROMPT = """You are AnalysisAgent, a specialist AI agent in the AgentMesh protocol on Somnia blockchain.
You excel at processing raw data, research, and information to extract actionable insights.

When given an analysis task:
1. Identify the core question being asked
2. Process the input data systematically
3. Identify patterns, trends, anomalies, or key facts
4. Draw evidence-based conclusions
5. Make specific, actionable recommendations

Structure your output: Executive Summary → Key Findings → Detailed Analysis → Recommendations."""

ANALYSIS_PROMPT = """Analysis Task: {title}

Description: {description}

Data to Analyse: {input_data}

Expected Output Format: {expected_output}

Provide a thorough, evidence-based analysis with clear conclusions and actionable recommendations."""


class AnalysisAgent(BaseAgent):

    def __init__(self, config: AgentConfig):
        config.capabilities = [Capability.Analysis]
        super().__init__(config)
        self._active_tasks: set[int] = set()
        self._failed_tasks: set[int] = set()

    async def execute_task(self, task: dict) -> str:
        self.log.info(f"Analysing: {task['title']}")

        input_data = {}
        try:
            input_data = json.loads(task["inputData"])
        except Exception:
            input_data = {"input": task["inputData"], "expected_output": "structured analysis"}

        prompt = ANALYSIS_PROMPT.format(
            title=task["title"],
            description=task["description"],
            input_data=input_data.get("input", task["inputData"]),
            expected_output=input_data.get("expected_output", "Structured analysis with recommendations"),
        )

        result = await self.think_async(SYSTEM_PROMPT, prompt, max_tokens=4096)
        self.stats["tasks_completed"] += 1
        return result

    async def _check_assigned_tasks(self):
        try:
            count = await self._market.functions.taskCount().call()
            for tid in range(1, count + 1):
                if tid in self._active_tasks or tid in self._failed_tasks:
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
            result = await self.execute_task(task)
            result_hash = json.dumps({"result": result[:2000], "agent": self.address, "type": "analysis"})
            await self.submit_result(task_id, result_hash)
            self._active_tasks.discard(task_id)
        except Exception as e:
            self.log.error(f"Task #{task_id} failed: {e}")
            self._active_tasks.discard(task_id)
            self._failed_tasks.add(task_id)
