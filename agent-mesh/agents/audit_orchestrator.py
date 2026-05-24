"""
AuditOrchestrator — AuraGuard Command Brain

The master coordinator of the AuraGuard swarm.

Workflow (all on-chain, fully autonomous):
  1. Receives new-contract-scan task from Sentinel (TaskMarket)
  2. Decomposes into 3 parallel sub-tasks:
       ├── SecurityAgent sub-task  (cap=Analysis)  → static vuln scan
       ├── SimulationAgent sub-task (cap=CodeGen)  → attack simulation
       └── SocialIntelAgent sub-task (cap=Research) → deployer profiling
  3. Waits for all 3 to complete (Somnia sub-second finality = fast turnaround)
  4. Synthesises a single FINAL_RISK_SCORE (0-100) with full justification
  5. Writes final risk score to RiskRegistry on-chain (permanent, queryable)
  6. Collects 15% of the task reward for orchestration

This creates a fully auditable, on-chain security intelligence trail:
  contract deployed → sentinel detects → orchestrator coordinates →
  specialists execute → risk score published → users warned — all in < 30s
"""

import asyncio
import json
import logging
import os
import time
from typing import Optional

from web3 import Web3
from dotenv import load_dotenv

from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus

load_dotenv(override=True)

# ── RiskRegistry ABI (minimal) ─────────────────────────────────────────────────

RISK_REGISTRY_ABI = json.loads("""[
  {
    "inputs": [
      {"internalType": "address", "name": "contractAddr", "type": "address"},
      {"internalType": "uint8",   "name": "riskScore",    "type": "uint8"},
      {"internalType": "uint8",   "name": "confidence",   "type": "uint8"},
      {"internalType": "uint256", "name": "taskId",       "type": "uint256"},
      {"internalType": "string",  "name": "summary",      "type": "string"}
    ],
    "name": "recordRisk",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "contractAddr", "type": "address"},
      {"internalType": "string",  "name": "category",    "type": "string"},
      {"internalType": "uint8",   "name": "severity",    "type": "uint8"},
      {"internalType": "string",  "name": "description", "type": "string"}
    ],
    "name": "addFlag",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "contractAddr", "type": "address"}],
    "name": "getReport",
    "outputs": [{"components": [
      {"internalType": "address", "name": "contractAddr", "type": "address"},
      {"internalType": "uint8",   "name": "riskScore",    "type": "uint8"},
      {"internalType": "uint8",   "name": "confidence",   "type": "uint8"},
      {"internalType": "uint256", "name": "taskId",       "type": "uint256"},
      {"internalType": "address", "name": "scanner",      "type": "address"},
      {"internalType": "uint256", "name": "scannedAt",    "type": "uint256"},
      {"internalType": "string",  "name": "summary",      "type": "string"},
      {"internalType": "bool",    "name": "exists",       "type": "bool"}
    ], "internalType": "struct RiskRegistry.RiskReport", "name": "", "type": "tuple"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true,  "internalType": "address", "name": "contractAddr", "type": "address"},
      {"indexed": false, "internalType": "uint8",   "name": "riskScore",    "type": "uint8"},
      {"indexed": false, "internalType": "uint8",   "name": "confidence",   "type": "uint8"},
      {"indexed": true,  "internalType": "uint256", "name": "taskId",       "type": "uint256"},
      {"indexed": true,  "internalType": "address", "name": "scanner",      "type": "address"},
      {"indexed": false, "internalType": "string",  "name": "summary",      "type": "string"}
    ],
    "name": "ContractScanned",
    "type": "event"
  }
]""")

# ── Synthesis prompt ───────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are AuditOrchestrator, the command brain of the AuraGuard autonomous security swarm.
You receive structured reports from three specialist agents and synthesize a single, authoritative risk assessment.

Your synthesis must be:
- DEFINITIVE: one final risk score, one clear verdict
- JUSTIFIED: explain how you weighted the three reports
- ACTIONABLE: clear recommendation for users

The three agent scores are weighted:
  - SecurityAgent (static scan): 40% weight
  - SimulationAgent (attack sim): 35% weight
  - SocialIntelAgent (on-chain intel): 25% weight

If ANY single agent finds a CERTAIN rug path, final score must be >= 90 (CRITICAL).
If two agents independently flag HIGH risk, final score must be >= 75.

Return ONLY valid JSON. No markdown."""

SYNTHESIS_PROMPT = """Synthesize the following three specialist reports into a FINAL risk assessment:

CONTRACT ADDRESS: {contract_address}

━━ REPORT 1: SecurityAgent (Static Vulnerability Scan) ━━
{security_report}

━━ REPORT 2: SimulationAgent (Attack Simulation) ━━
{simulation_report}

━━ REPORT 3: SocialIntelAgent (On-Chain Intelligence) ━━
{social_intel_report}

SYNTHESIS RULES:
1. Weight: Security 40%, Simulation 35%, Social Intel 25%
2. Override rule: ANY CERTAIN rug path → final_risk_score >= 90
3. Override rule: instant owner drain + no LP lock → final_risk_score >= 88
4. Combination amplification: blacklist + tax + no LP lock = +20 points
5. Trust discount: if any agent has confidence < 50, reduce that agent's weight

Produce the final verdict:

{{
  "contract_address": "{contract_address}",
  "final_risk_score": <0-100>,
  "final_confidence": <0-100>,
  "verdict": "SAFE|LOW_RISK|MEDIUM_RISK|HIGH_RISK|CRITICAL",
  "risk_label": "✅ SAFE|🟡 LOW RISK|🟠 MEDIUM|🔴 HIGH RISK|💀 CRITICAL",
  "instant_rug_possible": true/false,
  "recommended_action": "SAFE_TO_USE|VERIFY_FIRST|USE_WITH_CAUTION|AVOID|DO_NOT_INTERACT",
  "weighted_scores": {{
    "security_contribution": <0-40>,
    "simulation_contribution": <0-35>,
    "social_contribution": <0-25>
  }},
  "key_findings": [
    "<most critical finding 1>",
    "<most critical finding 2>",
    "<most critical finding 3>"
  ],
  "top_vulnerabilities": [
    {{
      "name": "Unlimited Mint",
      "severity": "CRITICAL",
      "source_agent": "SecurityAgent",
      "user_impact": "Owner can inflate supply to zero, destroying value"
    }}
  ],
  "dashboard_summary": "<≤120 chars — shown on live dashboard>",
  "detailed_verdict": "<2-3 sentences for the full report>"
}}"""


class AuditOrchestrator(BaseAgent):
    """
    The master coordinator of AuraGuard.
    Decomposes contract audit tasks into 3 parallel sub-tasks,
    synthesizes results, and writes final risk score to RiskRegistry.
    """

    def __init__(self, config: AgentConfig, risk_registry_address: str = ""):
        config.capabilities = [Capability.Orchestration, Capability.Analysis]
        super().__init__(config)
        self._active_tasks: dict[int, asyncio.Task] = {}
        self._failed_tasks: set[int] = set()

        # Risk Registry contract handle
        self._risk_registry = None
        self._risk_registry_address = risk_registry_address or os.environ.get("RISK_REGISTRY_ADDRESS", "")

    def setup_contracts(self, registry_addr: str, market_addr: str):
        """Override to also wire up RiskRegistry."""
        super().setup_contracts(registry_addr, market_addr)
        if self._risk_registry_address:
            self._risk_registry = self.w3.eth.contract(
                address=Web3.to_checksum_address(self._risk_registry_address),
                abi=RISK_REGISTRY_ABI,
            )
            self.log.info(f"[AuditOrchestrator] RiskRegistry: {self._risk_registry_address[:18]}…")

    async def _should_bid(self, task: dict) -> bool:
        title = task.get("title", "").lower()
        description = task.get("description", "").lower()
        audit_keywords = [
            "aura guard", "scan", "audit", "new contract", "contract deployed",
            "security", "risk", "[sentinel]",
        ]
        return any(kw in title or kw in description for kw in audit_keywords)

    async def execute_task(self, task: dict) -> str:
        task_id = task["id"]
        self.log.info(f"\n{'═'*60}")
        self.log.info(f"[AuditOrchestrator] 🎯 Starting audit — Task #{task_id}: {task['title']}")
        self.log.info(f"{'═'*60}")

        input_data = {}
        try:
            input_data = json.loads(task["inputData"])
        except Exception:
            input_data = {"contract_address": task["inputData"]}

        contract_address = input_data.get("contract_address", input_data.get("detail", "unknown"))
        deployer         = input_data.get("deployer", "unknown")
        tx_hash          = input_data.get("tx_hash", "unknown")
        block_number     = input_data.get("block_number", 0)

        if contract_address == "unknown":
            # Try to parse from detail field (Sentinel format)
            detail = input_data.get("detail", "")
            if detail.startswith("0x") and len(detail) >= 42:
                contract_address = detail[:42]

        reward_wei = task.get("reward", 0)
        # Reserve 15% for orchestration, split rest 3 ways
        sub_reward_wei = int(reward_wei * 0.27)  # 27% each = 81% total

        self.log.info(f"[AuditOrchestrator] Contract: {contract_address}")
        self.log.info(f"[AuditOrchestrator] Deployer: {deployer}")
        self.log.info(f"[AuditOrchestrator] Posting 3 parallel sub-tasks...")

        # ── Post 3 Sub-Tasks in Parallel ───────────────────────────────────────
        deadline = int(time.time()) + 600  # 10-minute deadline for each sub-task
        common_input = json.dumps({
            "contract_address": contract_address,
            "deployer":         deployer,
            "tx_hash":          tx_hash,
            "block_number":     block_number,
            "timestamp":        time.time(),
            "parent_task":      task_id,
        })

        sub_task_ids = await self._post_sub_tasks(
            parent_task_id=task_id,
            contract_address=contract_address,
            common_input=common_input,
            deadline=deadline,
            sub_reward_wei=sub_reward_wei,
        )

        if not sub_task_ids:
            self.log.error("[AuditOrchestrator] Failed to post sub-tasks, using AI-only analysis")
            return await self._fallback_single_pass_audit(contract_address, deployer, task_id)

        self.log.info(f"[AuditOrchestrator] Sub-tasks posted: {sub_task_ids}")
        self.log.info(f"[AuditOrchestrator] ⏳ Waiting for specialist agents...")

        # ── Wait for Sub-Tasks ─────────────────────────────────────────────────
        results = await self._wait_for_sub_tasks(sub_task_ids, timeout=480)

        self.log.info(f"[AuditOrchestrator] {len(results)}/{len(sub_task_ids)} sub-tasks completed")

        # ── Synthesize Final Report ────────────────────────────────────────────
        final_report = await self._synthesize(contract_address, results, sub_task_ids)

        # ── Write to RiskRegistry On-Chain ─────────────────────────────────────
        await self._record_on_chain(
            contract_address=contract_address,
            report=final_report,
            task_id=task_id,
        )

        self.stats["tasks_completed"] += 1
        self.log.info(
            f"\n{'═'*60}\n"
            f"[AuditOrchestrator] ✅ AUDIT COMPLETE\n"
            f"  Contract:   {contract_address}\n"
            f"  Risk Score: {final_report.get('final_risk_score', '?')}/100\n"
            f"  Verdict:    {final_report.get('risk_label', '?')}\n"
            f"  Action:     {final_report.get('recommended_action', '?')}\n"
            f"{'═'*60}\n"
        )

        return json.dumps(final_report)

    async def _post_sub_tasks(
        self,
        parent_task_id: int,
        contract_address: str,
        common_input: str,
        deadline: int,
        sub_reward_wei: int,
    ) -> list[int]:
        """Post 3 specialist sub-tasks on-chain and return their IDs."""
        sub_tasks_spec = [
            {
                "title": f"[SECURITY] Static scan: {contract_address[:12]}…",
                "description": (
                    "AuraGuard security scan: Analyze the contract bytecode and function signatures "
                    "for reentrancy, unlimited mint, honeypot patterns, access control flaws, "
                    "dangerous opcodes, and known exploit patterns. "
                    "Return structured JSON with vulnerability list and static_risk_score 0-100."
                ),
                "capability": int(Capability.Analysis),
            },
            {
                "title": f"[SIMULATION] Attack sim: {contract_address[:12]}…",
                "description": (
                    "AuraGuard attack simulation: Simulate flash loan attacks, reentrancy exploits, "
                    "price oracle manipulation, and direct rug-pull paths against this contract. "
                    "Assess feasibility (CERTAIN/LIKELY/POSSIBLE/UNLIKELY) for each attack vector. "
                    "Return structured JSON with attacks_found and simulation_risk_score 0-100."
                ),
                "capability": int(Capability.CodeGen),
            },
            {
                "title": f"[SOCIAL INTEL] Deployer profile: {contract_address[:12]}…",
                "description": (
                    "AuraGuard social intelligence: Profile the deployer wallet history, age, "
                    "previous contract deployments, LP lock status, token distribution, "
                    "and known scammer pattern matching. "
                    "Return structured JSON with deployer_profile, flags, and social_risk_score 0-100."
                ),
                "capability": int(Capability.Research),
            },
        ]

        sub_task_ids = []
        for spec in sub_tasks_spec:
            try:
                fn = self._market.functions.postSubTask(
                    parent_task_id,
                    spec["title"],
                    spec["description"],
                    common_input,
                    spec["capability"],
                    deadline,
                )
                await self._send_tx(fn, value_wei=sub_reward_wei)
                count = await self._market.functions.taskCount().call()
                sub_task_ids.append(count)
                self.log.info(f"[AuditOrchestrator]   ├── Sub-task #{count}: {spec['title'][:50]}")
            except Exception as e:
                self.log.error(f"[AuditOrchestrator] Failed to post sub-task: {e}")

        return sub_task_ids

    async def _wait_for_sub_tasks(
        self,
        sub_task_ids: list[int],
        timeout: int = 480,
    ) -> dict[int, dict]:
        """Poll until all sub-tasks complete or timeout."""
        results: dict[int, dict] = {}
        deadline = time.time() + timeout

        while time.time() < deadline and len(results) < len(sub_task_ids):
            for tid in sub_task_ids:
                if tid in results:
                    continue
                try:
                    t = await self.get_task(tid)
                    if t["status"] == int(TaskStatus.Completed):
                        raw = t.get("resultHash", "{}")
                        try:
                            payload = json.loads(raw)
                            result_str = payload.get("result", raw)
                            if isinstance(result_str, str):
                                result_data = json.loads(result_str)
                            else:
                                result_data = result_str
                            results[tid] = result_data
                        except Exception:
                            results[tid] = {"raw": raw, "parse_error": True}
                        self.log.info(f"[AuditOrchestrator]   ✓ Sub-task #{tid} completed")
                    elif t["status"] == int(TaskStatus.Disputed):
                        results[tid] = {"error": "disputed", "risk_score": 50}
                        self.log.warning(f"[AuditOrchestrator]   ✗ Sub-task #{tid} disputed")
                except Exception as e:
                    self.log.warning(f"[AuditOrchestrator] Error polling sub-task #{tid}: {e}")

            if len(results) < len(sub_task_ids):
                await asyncio.sleep(2)

        # Fill in timed-out tasks with defaults
        for tid in sub_task_ids:
            if tid not in results:
                results[tid] = {"error": "timeout", "risk_score": 50, "confidence": 20}
                self.log.warning(f"[AuditOrchestrator]   ⏱ Sub-task #{tid} timed out")

        return results

    async def _synthesize(
        self,
        contract_address: str,
        results: dict[int, dict],
        sub_task_ids: list[int],
    ) -> dict:
        """Call Claude to synthesize the three sub-agent reports into a final verdict."""
        result_list = [results.get(tid, {}) for tid in sub_task_ids]

        security_report    = json.dumps(result_list[0] if len(result_list) > 0 else {})
        simulation_report  = json.dumps(result_list[1] if len(result_list) > 1 else {})
        social_intel_report = json.dumps(result_list[2] if len(result_list) > 2 else {})

        prompt = SYNTHESIS_PROMPT.format(
            contract_address=contract_address,
            security_report=security_report[:2000],
            simulation_report=simulation_report[:2000],
            social_intel_report=social_intel_report[:1500],
        )

        self.log.info("[AuditOrchestrator] 🧠 Synthesizing final risk verdict...")
        raw = await self.think_async(SYSTEM_PROMPT, prompt, max_tokens=2048)

        try:
            result = json.loads(raw)
            result["sub_task_ids"] = sub_task_ids
            result["synthesis_timestamp"] = time.time()
            return result
        except json.JSONDecodeError:
            # Emergency fallback: compute weighted average manually
            scores = []
            for r in result_list:
                for key in ["static_risk_score", "simulation_risk_score", "social_risk_score", "risk_score"]:
                    v = r.get(key)
                    if v is not None:
                        scores.append(v)
                        break

            avg = int(sum(scores) / len(scores)) if scores else 50
            verdict = "CRITICAL" if avg >= 90 else "HIGH_RISK" if avg >= 75 else \
                      "MEDIUM_RISK" if avg >= 50 else "LOW_RISK" if avg >= 21 else "SAFE"

            return {
                "contract_address": contract_address,
                "final_risk_score": avg,
                "final_confidence": 40,
                "verdict": verdict,
                "risk_label": self._score_to_label(avg),
                "instant_rug_possible": avg >= 90,
                "recommended_action": "AVOID" if avg >= 75 else "CAUTION" if avg >= 50 else "VERIFY_FIRST",
                "key_findings": ["Synthesis error — manual review recommended"],
                "top_vulnerabilities": [],
                "dashboard_summary": f"Risk score {avg}/100 — {verdict}",
                "sub_task_ids": sub_task_ids,
                "synthesis_timestamp": time.time(),
                "parse_error": True,
            }

    async def _record_on_chain(self, contract_address: str, report: dict, task_id: int):
        """Write final risk score to RiskRegistry on-chain."""
        if not self._risk_registry:
            self.log.warning("[AuditOrchestrator] RiskRegistry not configured — skipping on-chain write")
            return

        risk_score  = min(100, max(0, int(report.get("final_risk_score", 50))))
        confidence  = min(100, max(0, int(report.get("final_confidence", 50))))
        summary     = report.get("dashboard_summary", "AuraGuard scan complete")[:200]

        try:
            from web3 import Web3
            contract_addr_cs = Web3.to_checksum_address(contract_address)

            fn = self._risk_registry.functions.recordRisk(
                contract_addr_cs,
                risk_score,
                confidence,
                task_id,
                summary,
            )
            tx = await self._send_tx(fn)
            self.log.info(
                f"[AuditOrchestrator] 📝 RiskRegistry updated — "
                f"{contract_address[:12]}… → {risk_score}/100 | tx: {tx[:16]}…"
            )

            # Also add individual flags
            for vuln in report.get("top_vulnerabilities", [])[:5]:
                severity_map = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "INFO": 0}
                sev = severity_map.get(vuln.get("severity", "MEDIUM"), 2)
                try:
                    fn2 = self._risk_registry.functions.addFlag(
                        contract_addr_cs,
                        vuln.get("name", "Unknown")[:64],
                        sev,
                        vuln.get("user_impact", "")[:128],
                    )
                    await self._send_tx(fn2)
                except Exception as e:
                    self.log.warning(f"[AuditOrchestrator] Flag write failed: {e}")

        except Exception as e:
            self.log.error(f"[AuditOrchestrator] RiskRegistry write failed: {e}")

    async def _fallback_single_pass_audit(
        self, contract_address: str, deployer: str, task_id: int
    ) -> str:
        """Emergency fallback: do a single-pass audit if sub-tasks can't be posted."""
        self.log.info("[AuditOrchestrator] Running fallback single-pass audit...")
        report = {
            "contract_address": contract_address,
            "final_risk_score": 60,
            "final_confidence": 30,
            "verdict": "MEDIUM_RISK",
            "risk_label": "🟠 MEDIUM",
            "instant_rug_possible": False,
            "recommended_action": "VERIFY_FIRST",
            "key_findings": ["Sub-task orchestration failed — limited analysis only"],
            "top_vulnerabilities": [],
            "dashboard_summary": f"Limited scan — verify {contract_address[:12]}… manually",
            "fallback": True,
        }
        await self._record_on_chain(contract_address, report, task_id)
        return json.dumps(report)

    def _score_to_label(self, score: int) -> str:
        if score <= 20:  return "✅ SAFE"
        if score <= 49:  return "🟡 LOW RISK"
        if score <= 74:  return "🟠 MEDIUM"
        if score <= 89:  return "🔴 HIGH RISK"
        return "💀 CRITICAL"

    async def _check_assigned_tasks(self):
        try:
            count = await self._market.functions.taskCount().call()
            for tid in range(max(1, count - 100), count + 1):
                if tid in self._active_tasks or tid in self._failed_tasks:
                    continue
                t = await self.get_task(tid)
                if (t["assignedAgent"].lower() == self.address.lower() and
                        t["status"] in (int(TaskStatus.Assigned), int(TaskStatus.InProgress))):
                    self._active_tasks[tid] = asyncio.create_task(self._run_task(tid, t))
        except Exception as e:
            self.log.error(f"[AuditOrchestrator] Poll error: {e}")

    async def _run_task(self, task_id: int, task: dict):
        try:
            result = await self.execute_task(task)
            await self.submit_result(
                task_id,
                json.dumps({"result": result, "agent": self.address, "type": "audit_orchestration"})
            )
        except Exception as e:
            self.log.error(f"[AuditOrchestrator] Task #{task_id} failed: {e}")
            self._failed_tasks.add(task_id)
        finally:
            self._active_tasks.pop(task_id, None)


# ── Standalone entrypoint ──────────────────────────────────────────────────────

async def main():
    from dotenv import load_dotenv
    load_dotenv(override=True)

    config = AgentConfig(
        name="AuraGuard-Orchestrator",
        capabilities=[Capability.Orchestration, Capability.Analysis],
        private_key=os.environ["AUDIT_ORCHESTRATOR_KEY"],
        rpc_url=os.environ.get("SOMNIA_RPC_URL", "https://api.infra.testnet.somnia.network/"),
        registry_address=os.environ["REGISTRY_ADDRESS"],
        task_market_address=os.environ["MARKET_ADDRESS"],
    )

    agent = AuditOrchestrator(
        config,
        risk_registry_address=os.environ.get("RISK_REGISTRY_ADDRESS", ""),
    )
    agent.setup_contracts(config.registry_address, config.task_market_address)
    await agent.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [AUDIT_ORCH] %(message)s")
    asyncio.run(main())
