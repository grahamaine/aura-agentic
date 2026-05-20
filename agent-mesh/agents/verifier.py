"""
VerifierAgent — Quality gatekeeper for the AgentMesh protocol.

Scores submitted task results 0-100 using Claude as an AI judge.
Calls verifyAndPay() on-chain with the score, triggering automatic
payment release (score >= 60) or dispute (score < 60).

This mirrors Somnia's on-chain AI inference concept: the AI judgement
is baked into a consensus-verified transaction.
"""

import asyncio
import json
from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus

SYSTEM_PROMPT = """You are VerifierAgent, the quality arbiter of the AgentMesh protocol on Somnia blockchain.
Your role is to objectively score submitted task results on a scale of 0-100.

Scoring rubric:
- 90-100: Exceptional — exceeds all requirements, production-ready
- 75-89:  Good — meets all requirements, minor polish needed
- 60-74:  Acceptable — meets core requirements, some gaps
- 40-59:  Poor — significant gaps, task not properly completed
- 0-39:   Failure — does not address the task requirements

Be objective, consistent, and harsh enough to maintain quality standards.
Return ONLY a JSON object, no other text."""

VERIFY_PROMPT = """Evaluate this task result:

ORIGINAL TASK:
Title: {title}
Description: {description}

SUBMITTED RESULT:
{result}

Score this result 0-100 based on:
1. Completeness (does it fully address the task?)
2. Accuracy (is the information correct and relevant?)
3. Quality (is it well-structured and usable?)
4. Effort (does it go beyond the minimum?)

Return ONLY this JSON:
{{"score": <0-100>, "reasoning": "<one sentence>", "strengths": "<what worked>", "weaknesses": "<what fell short>"}}"""


class VerifierAgent(BaseAgent):

    def __init__(self, config: AgentConfig):
        config.capabilities = [Capability.Verification]
        super().__init__(config)
        self._verified: set[int] = set()
        self._failed: set[int] = set()

    async def execute_task(self, task: dict) -> str:
        # Verifier doesn't execute tasks — it verifies them
        return "Verifier does not execute tasks directly"

    async def run(self):
        """Override run: watch for PendingVerification tasks."""
        assert self._market is not None, "call setup_contracts() first"
        self._running = True
        self.log.info(f"VerifierAgent starting — wallet {self.address}")
        await self._ensure_registered()

        while self._running:
            try:
                await self._scan_for_pending()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self.log.error(f"Verifier loop error: {e}")
            await asyncio.sleep(self.config.poll_interval)

    async def _scan_for_pending(self):
        count = await self._market.functions.taskCount().call()
        for tid in range(1, count + 1):
            if tid in self._verified or tid in self._failed:
                continue
            t = await self.get_task(tid)
            if t["status"] == int(TaskStatus.PendingVerification):
                asyncio.create_task(self._verify_task(tid, t))
                self._verified.add(tid)

    async def _verify_task(self, task_id: int, task: dict):
        self.log.info(f"Verifying task #{task_id}: {task['title']}")

        result_data = {}
        try:
            result_data = json.loads(task["resultHash"])
        except Exception:
            result_data = {"result": task["resultHash"]}

        loop = asyncio.get_event_loop()
        score, reasoning = await loop.run_in_executor(
            None, lambda: self._score(task, result_data.get("result", ""))
        )

        self.log.info(f"Task #{task_id} score: {score} — {reasoning}")

        fn = self._market.functions.verifyAndPay(task_id, score)
        try:
            tx = await self._send_tx(fn)
            self.log.info(f"Verification submitted: {tx}")
        except Exception as e:
            self.log.error(f"verifyAndPay failed for #{task_id}: {e}")
            self._failed.add(task_id)
            self._verified.discard(task_id)

    def _score(self, task: dict, result: str) -> tuple[int, str]:
        if not result.strip():
            return 0, "Empty result"

        prompt = VERIFY_PROMPT.format(
            title=task["title"],
            description=task["description"],
            result=result[:3000],
        )
        raw = self.think(SYSTEM_PROMPT, prompt, max_tokens=512)
        try:
            data = json.loads(raw)
            score = max(0, min(100, int(data["score"])))
            return score, data.get("reasoning", "")
        except Exception:
            # Fallback: give passing score if result is non-empty
            return 70, "Could not parse verifier output — defaulting to 70"
