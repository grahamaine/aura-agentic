"""
SentinelAgent — Autonomous Somnia Block Intelligence

The sentinel is the self-directing brain of the AuraAgentic swarm.
It watches every Somnia block in real-time (<1s finality) and
autonomously spawns research/analysis/verification tasks for other
agents — with zero human intervention after deployment.

Why Somnia makes this possible:
  - <1s finality → sentinel sees every block as it lands
  - 1M+ TPS → the swarm can handle the task throughput it creates
  - On-chain payments → every intelligence report is incentivised
  On Ethereum (12s blocks) the latency would make real-time
  block-level intelligence impractical. Somnia enables it natively.
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

from web3 import Web3
from dotenv import load_dotenv

from base_agent import BaseAgent, AgentConfig, Capability, TASK_MARKET_ABI

load_dotenv(override=True)

log = logging.getLogger("sentinel")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [SENTINEL]  %(message)s",
    datefmt="%H:%M:%S",
)

SOMNIA_RPC = os.environ.get("SOMNIA_RPC_URL", "https://api.infra.testnet.somnia.network/")
REGISTRY_ADDR = os.environ.get(
    "REGISTRY_ADDRESS", "0xe72b8E159291E152860A0313E125d3d3c96FeD4e"
)
MARKET_ADDR = os.environ.get(
    "MARKET_ADDRESS", "0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA"
)


# ── Detection model ───────────────────────────────────────────────────────────

@dataclass
class Detection:
    rule: str
    label: str
    detail: str
    block_num: int
    timestamp: float
    task_id: Optional[int] = None
    spawned_ok: bool = False


# ── Sentinel detection rules ──────────────────────────────────────────────────

RULES = [
    # ── AuraGuard Rules (new) ─────────────────────────────────────────────────
    dict(
        name="new_contract_deployed",
        label="⚠️  New Contract Deployed",
        cap=Capability.Orchestration,
        reward_eth=0.003,
        cooldown=3,           # Low cooldown — every new contract should be scanned
        title="[AURA GUARD] 🔍 Scan new contract: {detail}",
        description=(
            "A new smart contract was just deployed on Somnia. "
            "AuraGuard autonomous security swarm: coordinate a full 3-agent audit. "
            "Post sub-tasks to SecurityAgent (static scan), SimulationAgent (attack sim), "
            "and SocialIntelAgent (deployer profiling). "
            "Synthesise a final RISK_SCORE (0-100) and write it to the RiskRegistry on-chain. "
            "Input JSON contains: contract_address, deployer, tx_hash, block_number, timestamp."
        ),
    ),
    dict(
        name="large_transfer_detected",
        label="🐋 Large Token Transfer",
        cap=Capability.Analysis,
        reward_eth=0.002,
        cooldown=20,
        title="[AURA GUARD] 🐋 Large transfer detected — {detail}",
        description=(
            "An unusually large token transfer was detected on Somnia. "
            "Analyse: (1) Is this wallet a known deployer or whale? "
            "(2) Could this be a coordinated dump or LP removal? "
            "(3) Is there a related contract at risk? "
            "Return JSON: {wallet_profile, transfer_risk, related_contracts, alert_level}."
        ),
    ),
    dict(
        name="rapid_deploy_pattern",
        label="🏭 Rapid Contract Deployment",
        cap=Capability.Research,
        reward_eth=0.002,
        cooldown=60,
        title="[AURA GUARD] 🏭 Rapid deployment pattern: {detail}",
        description=(
            "Multiple contracts were deployed from the same wallet within a short window. "
            "Research: (1) Is this a known scam factory pattern? "
            "(2) What do the deployed contracts have in common? "
            "(3) Are any already attracting user funds? "
            "Return JSON: {factory_pattern, contracts, risk_assessment, recommended_action}."
        ),
    ),

    # ── Existing AgentMesh Rules ───────────────────────────────────────────────
    dict(
        name="new_agent",
        label="New Agent Registered",
        cap=Capability.Analysis,
        reward_eth=0.001,
        cooldown=45,
        title="[SENTINEL] Profile new Somnia agent: {detail}",
        description=(
            "A new autonomous agent just registered on the Somnia testnet AgentRegistry.\n"
            "Analyse: (1) stated capabilities vs typical workloads, "
            "(2) stake amount relative to peers, "
            "(3) estimated reliability score 0-100. "
            "Return structured JSON: {capabilities, stake_analysis, trust_score, recommendation}."
        ),
    ),
    dict(
        name="high_value_task",
        label="High-Value Task Detected",
        cap=Capability.Research,
        reward_eth=0.002,
        cooldown=30,
        title="[SENTINEL] Analyse high-value task opportunity: {detail}",
        description=(
            "A task with an unusually high STT reward was posted to the Somnia TaskMarket.\n"
            "Research: (1) complexity of the stated requirements, "
            "(2) which agent capability is best suited, "
            "(3) estimated completion time and risk factors. "
            "Return JSON: {complexity, best_cap, estimated_hours, risk, bid_recommendation}."
        ),
    ),
    dict(
        name="velocity_spike",
        label="Task Velocity Spike",
        cap=Capability.DataFetch,
        reward_eth=0.001,
        cooldown=90,
        title="[SENTINEL] Investigate task market velocity spike: {detail}",
        description=(
            "Unusual burst of activity detected on the Somnia TaskMarket.\n"
            "Fetch and analyse: (1) categories of spiking tasks, "
            "(2) are they from one poster or many, "
            "(3) ecosystem signal this represents. "
            "Return JSON: {task_types, poster_diversity, ecosystem_signal, forecast}."
        ),
    ),
    dict(
        name="elite_result",
        label="Elite Quality Score",
        cap=Capability.Verification,
        reward_eth=0.001,
        cooldown=30,
        title="[SENTINEL] Verify elite result — Task #{detail}",
        description=(
            "A task just completed with a quality score ≥ 90/100 on Somnia.\n"
            "Independently verify: (1) the result hash is consistent, "
            "(2) methodology quality, "
            "(3) whether this agent deserves a reputation boost. "
            "Return JSON: {result_valid, methodology_score, rep_boost_warranted, notes}."
        ),
    ),
    dict(
        name="ecosystem_pulse",
        label="Ecosystem Health Pulse",
        cap=Capability.Analysis,
        reward_eth=0.001,
        cooldown=180,
        title="[SENTINEL] Somnia ecosystem health pulse — Block #{detail}",
        description=(
            "Periodic autonomous ecosystem health check on Somnia testnet.\n"
            "Analyse current state: (1) total registered agents and active ratio, "
            "(2) task completion rate, (3) average quality score trend, "
            "(4) STT flow through the protocol. "
            "Return JSON: {agent_count, active_ratio, completion_rate, avg_quality, stt_flow, health_rating}."
        ),
    ),
]

# Track deployer → block windows for rapid-deploy detection
_deploy_tracker: dict[str, list[int]] = {}


# ── Sentinel agent ────────────────────────────────────────────────────────────

class SentinelAgent(BaseAgent):
    """
    Autonomous block watcher — the self-directing orchestrator of AuraAgentic.

    Unlike other agents that respond to tasks, the Sentinel CREATES tasks.
    It is the only agent in the swarm that needs no external trigger.
    After deployment it runs indefinitely, maintaining a closed autonomous loop:

        Sentinel detects event
            → posts research task with STT reward (on-chain)
                → ResearchAgent bids and executes
                    → VerifierAgent scores result
                        → payment released (on-chain)
                            → Sentinel reads quality score
                                → may spawn follow-up verification task

    Zero human involvement. Entirely on-chain. Uniquely enabled by Somnia's speed.
    """

    def __init__(self, config: AgentConfig):
        super().__init__(config)
        self.last_block: int = 0
        self._market_tx_window: list[int] = []   # rolling 10-block task count
        self._rule_last_fired: dict[str, float] = {}
        self.detections: list[Detection] = []

    # ── BaseAgent interface ───────────────────────────────────────────────────

    async def execute_task(self, task: dict) -> str:
        """Sentinel creates tasks; it does not execute them."""
        return json.dumps({"status": "sentinel_only",
                           "note": "Sentinel is a task creator, not a task executor."})

    # ── Public entry point ────────────────────────────────────────────────────

    async def run(self):
        """Override base run() — sentinel watches blocks instead of polling tasks."""
        self._running = True
        self.log.info(f"Starting — wallet {self.address}")
        await self._ensure_registered()

        self.last_block = await self.w3.eth.block_number
        self.log.info(
            f"Block #{self.last_block} | "
            f"Polling every 500 ms (Somnia <1 s finality = every block captured)"
        )

        pulse_counter = 0
        while self._running:
            try:
                await self._tick()
                pulse_counter += 1
                # Ecosystem health pulse every ~500 blocks (~500 s ≈ 8 min)
                if pulse_counter % 500 == 0:
                    await self._fire("ecosystem_pulse", str(self.last_block))
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.log.warning(f"Tick error: {exc}")
            await asyncio.sleep(0.5)

    # ── Block watch loop ──────────────────────────────────────────────────────

    async def _tick(self):
        current = await self.w3.eth.block_number
        if current <= self.last_block:
            return
        for bn in range(self.last_block + 1, current + 1):
            await self._process_block(bn)
        self.last_block = current

    async def _process_block(self, block_num: int):
        try:
            block = await self.w3.eth.get_block(block_num, full_transactions=True)
        except Exception:
            return

        market_lc   = self._market.address.lower()
        registry_lc = self._registry.address.lower()
        block_market_txs = 0
        block_deployers: list[str] = []   # deployers this block

        for tx in block.transactions:
            to = (tx.get("to") or "").lower()

            # ── 🆕 AuraGuard: Contract Deployment Detection ───────────────────
            if not tx.get("to"):  # null 'to' = contract creation
                sender = tx["from"]
                try:
                    receipt = await self.w3.eth.get_transaction_receipt(tx.hash)
                    if receipt and receipt.get("contractAddress"):
                        deployed_addr = receipt["contractAddress"]
                        block_deployers.append(sender.lower())

                        # Track rapid-deploy pattern
                        if sender.lower() not in _deploy_tracker:
                            _deploy_tracker[sender.lower()] = []
                        _deploy_tracker[sender.lower()].append(block_num)
                        # Keep only last 20 blocks
                        _deploy_tracker[sender.lower()] = [
                            b for b in _deploy_tracker[sender.lower()]
                            if block_num - b <= 20
                        ]

                        # Fire scan task with full context
                        detail = json.dumps({
                            "contract_address": deployed_addr,
                            "deployer": sender,
                            "tx_hash": tx.hash.hex(),
                            "block_number": block_num,
                            "timestamp": time.time(),
                        })
                        await self._fire("new_contract_deployed", deployed_addr)

                        # Check for rapid-deploy factory pattern (>3 contracts in 20 blocks)
                        recent_deploys = _deploy_tracker.get(sender.lower(), [])
                        if len(recent_deploys) >= 3:
                            await self._fire(
                                "rapid_deploy_pattern",
                                f"{sender[:10]}… ({len(recent_deploys)} contracts in 20 blocks)"
                            )

                        self.log.info(
                            f"🚨 New contract: {deployed_addr[:12]}… "
                            f"by {sender[:10]}… | block #{block_num}"
                        )
                except Exception as e:
                    self.log.debug(f"Could not get receipt for deploy tx: {e}")

            # ── New agent registration ────────────────────────────────────────
            if to == registry_lc:
                sender = tx["from"]
                await self._fire(
                    "new_agent",
                    f"{sender[:10]}… (block #{block_num})",
                )

            # ── Task market activity ──────────────────────────────────────────
            if to == market_lc:
                block_market_txs += 1
                val_eth = float(self.w3.from_wei(tx.value, "ether"))
                if val_eth >= 0.005:          # ≥ 0.005 STT = significant reward
                    await self._fire(
                        "high_value_task",
                        f"{val_eth:.4f} STT (block #{block_num})",
                    )

        # ── Rolling velocity window ───────────────────────────────────────────
        self._market_tx_window.append(block_market_txs)
        if len(self._market_tx_window) > 10:
            self._market_tx_window.pop(0)

        if len(self._market_tx_window) >= 5:
            recent  = sum(self._market_tx_window[-3:]) / 3
            overall = sum(self._market_tx_window) / len(self._market_tx_window)
            if recent >= 3 and overall > 0 and recent > overall * 1.8:
                await self._fire(
                    "velocity_spike",
                    f"{int(recent)}/block avg (×{int(recent/overall)} baseline)",
                )

        # ── Elite quality completions ─────────────────────────────────────────
        try:
            completed = await self._market.events.TaskCompleted.get_logs(
                from_block=block_num, to_block=block_num
            )
            for ev in completed:
                score = ev.args.qualityScore
                if score >= 90:
                    await self._fire("elite_result", str(ev.args.taskId))
        except Exception:
            pass

        self.log.info(
            f"Block #{block_num} | market txs: {block_market_txs} | "
            f"detections: {len(self.detections)}"
        )

    # ── Detection → task spawning ─────────────────────────────────────────────

    async def _fire(self, rule_name: str, detail: str):
        """Apply cooldown, then post an on-chain task for this detection."""
        rule = next((r for r in RULES if r["name"] == rule_name), None)
        if rule is None:
            return

        now = time.time()
        if now - self._rule_last_fired.get(rule_name, 0) < rule["cooldown"]:
            return  # still in cooldown
        self._rule_last_fired[rule_name] = now

        title = rule["title"].format(detail=detail)
        detection = Detection(
            rule=rule_name,
            label=rule["label"],
            detail=detail,
            block_num=self.last_block,
            timestamp=now,
        )
        self.detections.append(detection)

        try:
            task_id = await self._post_sentinel_task(
                title=title,
                description=rule["description"],
                input_data=json.dumps({
                    "source":    "sentinel",
                    "rule":      rule_name,
                    "label":     rule["label"],
                    "detail":    detail,
                    "block":     self.last_block,
                    "timestamp": now,
                }),
                cap=rule["cap"],
                deadline=int(now) + 3600,
                reward_eth=rule["reward_eth"],
            )
            detection.task_id = task_id
            detection.spawned_ok = True
            self.log.info(f"🎯  Task #{task_id} spawned — {rule['label']}: {detail}")
        except Exception as exc:
            self.log.warning(f"Failed to spawn task ({rule_name}): {exc}")

    async def _post_sentinel_task(
        self,
        title: str,
        description: str,
        input_data: str,
        cap: Capability,
        deadline: int,
        reward_eth: float,
    ) -> int:
        """Post a task on TaskMarket and return the new task ID."""
        reward_wei = self.w3.to_wei(reward_eth, "ether")
        fn = self._market.functions.postTask(
            title,
            description,
            input_data,
            int(cap),
            deadline,
            2,  # priority = High
        )
        tx_hash_hex = await self._send_tx(fn, value_wei=reward_wei)

        # Parse receipt for TaskPosted event to extract taskId
        tx_hash_bytes = bytes.fromhex(tx_hash_hex.lstrip("0x"))
        receipt = await self.w3.eth.get_transaction_receipt(tx_hash_bytes)
        market_contract = self.w3.eth.contract(
            address=self._market.address, abi=TASK_MARKET_ABI
        )
        events = market_contract.events.TaskPosted().process_receipt(receipt)
        if not events:
            raise RuntimeError("TaskPosted event not found in receipt")
        return int(events[0].args.taskId)


# ── Entry point ───────────────────────────────────────────────────────────────

async def main():
    private_key = os.environ.get("PRIVATE_KEY") or os.environ.get("SENTINEL_KEY")
    if not private_key:
        raise EnvironmentError("Set PRIVATE_KEY (or SENTINEL_KEY) in .env")

    config = AgentConfig(
        name="AuraSentinel",
        capabilities=[Capability.Orchestration],
        private_key=private_key,
        rpc_url=SOMNIA_RPC,
        registry_address=REGISTRY_ADDR,
        task_market_address=MARKET_ADDR,
    )

    sentinel = SentinelAgent(config)
    sentinel.setup_contracts(REGISTRY_ADDR, MARKET_ADDR)

    print("\n" + "═" * 60)
    print("  AURA SENTINEL — Somnia Block Intelligence")
    print("═" * 60)
    print(f"  Wallet   : {sentinel.address}")
    print(f"  Registry : {REGISTRY_ADDR[:18]}…")
    print(f"  Market   : {MARKET_ADDR[:18]}…")
    print(f"  RPC      : {SOMNIA_RPC}")
    print(f"  Poll     : 500 ms  (Somnia <1 s finality)")
    print("═" * 60 + "\n")

    await sentinel.run()


if __name__ == "__main__":
    asyncio.run(main())
