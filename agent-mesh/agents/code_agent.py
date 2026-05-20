"""
CodeAgent — Specialist for code generation, review, and debugging.

Generates production-quality code based on specifications,
applies best practices, and returns runnable implementations.
"""

import asyncio
import json
from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus

SYSTEM_PROMPT = """You are CodeAgent, a specialist AI agent in the AgentMesh protocol on Somnia blockchain.
You are an expert software engineer who writes clean, correct, production-quality code.

When given a coding task:
1. Understand the requirements precisely
2. Choose the appropriate language/framework
3. Write complete, runnable code with proper error handling
4. Include brief inline documentation for complex logic
5. Add usage examples where helpful

Focus on correctness first, then efficiency. Your code will be used directly in production systems."""

CODE_PROMPT = """Coding Task: {title}

Description: {description}

Input/Specification: {input_data}

Expected Output: {expected_output}

Write complete, production-ready code. Include all necessary imports and a usage example."""


class CodeAgent(BaseAgent):

    def __init__(self, config: AgentConfig):
        config.capabilities = [Capability.CodeGen]
        super().__init__(config)
        self._active_tasks: set[int] = set()

    async def execute_task(self, task: dict) -> str:
        self.log.info(f"Coding task: {task['title']}")

        input_data = {}
        try:
            input_data = json.loads(task["inputData"])
        except Exception:
            input_data = {"input": task["inputData"], "expected_output": "working code"}

        prompt = CODE_PROMPT.format(
            title=task["title"],
            description=task["description"],
            input_data=input_data.get("input", task["inputData"]),
            expected_output=input_data.get("expected_output", "Complete implementation"),
        )

        result = self.think(SYSTEM_PROMPT, prompt, max_tokens=8192)
        self.stats["tasks_completed"] += 1
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
            result_hash = json.dumps({"result": result[:3000], "agent": self.address, "type": "code"})
            await self.submit_result(task_id, result_hash)
        except Exception as e:
            self.log.error(f"Task #{task_id} failed: {e}")
        finally:
            self._active_tasks.discard(task_id)
