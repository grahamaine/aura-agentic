"""
SimulationAgent — AuraGuard Attack Scenario Simulator

Simulates known DeFi attack vectors against a newly deployed contract
using AI-driven reasoning about the contract's structure.

Detects:
  - Flash loan attack surfaces
  - Price oracle manipulation vectors
  - Sandwich attack susceptibility
  - Reentrancy attack paths
  - Governance attack vectors (token-weighted voting manipulation)
  - Front-running opportunities that harm users

Registers with Capability.CodeGen — AuditOrchestrator posts sub-tasks
that this agent picks up and executes.
"""

import asyncio
import json
import logging
import os
import time

from dotenv import load_dotenv

from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus

load_dotenv(override=True)

log = logging.getLogger("simulation_agent")

SYSTEM_PROMPT = """You are SimulationAgent, an attack simulation specialist in the AuraGuard protocol.
You think like a sophisticated MEV bot, flash loan attacker, and rug pull executor.

Your job: Given a smart contract, simulate the most profitable attacks a malicious actor could execute.
This is a white-hat simulation — you identify attack paths so users can be warned BEFORE interacting.

Focus on attacks that:
1. Can be executed in a SINGLE TRANSACTION (highest risk)
2. Are replicable by a bot with flash loan capital
3. Result in user fund loss (not just protocol disruption)

Return ONLY valid JSON. No markdown. No explanation outside the JSON."""

SIMULATION_PROMPT = """Simulate attacks against this contract:

CONTRACT ADDRESS: {contract_address}
DEPLOYER: {deployer}
KNOWN FUNCTIONS: {known_functions}
BYTECODE SNIPPET: {bytecode_snippet}
STATIC SCAN FINDINGS: {static_findings}

Simulate these attack categories:

1. FLASH LOAN ATTACK
   - Can an attacker borrow massive funds, manipulate this contract's state, profit, repay?
   - Required: flash loan provider + this contract interaction in one tx

2. PRICE ORACLE MANIPULATION
   - Does this contract rely on on-chain price data?
   - Can prices be moved via flash loan to steal funds?

3. REENTRANCY
   - Can an attacker's contract re-enter during ETH/token transfer?
   - Map the exact call path

4. GOVERNANCE ATTACK
   - Can attacker acquire voting majority instantly?
   - Any timelock bypass?

5. SANDWICH / FRONTRUN
   - Any pending transactions that could be sandwiched for profit?

6. DIRECT RUG PULL PATH (1 tx from owner wallet)
   - What is the fastest way for the deployer to steal all user funds?

For each attack, provide:
- Feasibility (CERTAIN/LIKELY/POSSIBLE/UNLIKELY)
- Capital required (e.g., "flash loan $500k USDC")
- Profit estimate
- Execution steps (numbered)
- Time window (immediate/requires waiting/unlikely)

Calculate SIMULATION_RISK_SCORE (0-100):
- Any CERTAIN attack = minimum 85
- Multiple LIKELY attacks = 70+
- Single LIKELY attack = 50+
- Only POSSIBLE attacks = 20-50

Return this JSON:
{{
  "contract_address": "{contract_address}",
  "simulation_risk_score": <0-100>,
  "confidence": <0-100>,
  "attacks_found": [
    {{
      "attack_type": "Flash Loan + Price Manipulation",
      "feasibility": "CERTAIN|LIKELY|POSSIBLE|UNLIKELY",
      "capital_required": "Flash loan $1M USDC",
      "estimated_profit": "$500k (50% of TVL)",
      "execution_steps": [
        "1. Borrow $1M USDC via Aave flash loan",
        "2. Swap USDC for token X, moving price 10x",
        "3. Call contract.harvest() which uses manipulated price",
        "4. Swap back, repay flash loan, pocket difference"
      ],
      "time_window": "immediate",
      "description": "Contract uses spot price from AMM pair that can be flash-loan manipulated."
    }}
  ],
  "deployer_rug_path": {{
    "steps": ["1. Call drainLiquidity()", "2. Sell all minted tokens"],
    "estimated_time": "< 30 seconds",
    "estimated_loss_for_users": "100% of invested funds"
  }},
  "summary": "<one sentence for dashboard>",
  "simulation_notes": "<key observations>"
}}"""


class SimulationAgent(BaseAgent):
    """
    Attack simulation agent.
    Thinks like an attacker to find profitable exploit paths.
    """

    def __init__(self, config: AgentConfig):
        config.capabilities = [Capability.CodeGen]
        super().__init__(config)
        self._active_tasks: set[int] = set()
        self._failed_tasks: set[int] = set()

    async def _should_bid(self, task: dict) -> bool:
        title = task.get("title", "").lower()
        description = task.get("description", "").lower()
        sim_keywords = [
            "simulation", "simulate", "attack", "exploit", "flash loan",
            "aura guard", "reentrancy", "vulnerability", "security",
        ]
        return any(kw in title or kw in description for kw in sim_keywords)

    async def execute_task(self, task: dict) -> str:
        self.log.info(f"[SimulationAgent] Simulating attacks — Task #{task['id']}: {task['title']}")

        input_data = {}
        try:
            input_data = json.loads(task["inputData"])
        except Exception:
            input_data = {"contract_address": task["inputData"]}

        contract_address  = input_data.get("contract_address", "unknown")
        deployer          = input_data.get("deployer", "unknown")
        known_functions   = input_data.get("known_functions", [])
        static_findings   = input_data.get("static_findings", {})

        # Grab a slice of bytecode for context
        bytecode_snippet  = await self._get_bytecode_snippet(contract_address)

        prompt = SIMULATION_PROMPT.format(
            contract_address=contract_address,
            deployer=deployer,
            known_functions=json.dumps(known_functions),
            bytecode_snippet=bytecode_snippet,
            static_findings=json.dumps(static_findings)[:1500],
        )

        self.log.info(f"[SimulationAgent] Running attack simulations on {contract_address}...")
        raw = await self.think_async(SYSTEM_PROMPT, prompt, max_tokens=4096)

        try:
            result = json.loads(raw)
            result["agent"] = self.address
            result["agent_type"] = "SimulationAgent"
            result["scan_timestamp"] = time.time()
            self.stats["tasks_completed"] += 1

            attacks = result.get("attacks_found", [])
            certain = [a for a in attacks if a.get("feasibility") == "CERTAIN"]
            self.log.info(
                f"[SimulationAgent] ✅ Simulation complete — "
                f"RiskScore: {result.get('simulation_risk_score', '?')}/100 | "
                f"Attacks: {len(attacks)} | "
                f"Certain: {len(certain)}"
            )
            return json.dumps(result)

        except json.JSONDecodeError:
            fallback = {
                "contract_address": contract_address,
                "simulation_risk_score": 50,
                "confidence": 25,
                "attacks_found": [],
                "summary": "Attack simulation inconclusive — recommend caution.",
                "agent": self.address,
                "agent_type": "SimulationAgent",
                "parse_error": True,
                "raw_output": raw[:500],
            }
            self.log.warning("[SimulationAgent] ⚠️ Could not parse simulation output, using fallback")
            return json.dumps(fallback)

    async def _get_bytecode_snippet(self, contract_address: str) -> str:
        """Return first 1000 chars of bytecode for prompt context."""
        try:
            from web3 import Web3
            addr = Web3.to_checksum_address(contract_address)
            code = await self.w3.eth.get_code(addr)
            return code.hex()[:1000] if code else ""
        except Exception:
            return ""

    async def _check_assigned_tasks(self):
        try:
            count = await self._market.functions.taskCount().call()
            for tid in range(max(1, count - 50), count + 1):
                if tid in self._active_tasks or tid in self._failed_tasks:
                    continue
                t = await self.get_task(tid)
                if (t["assignedAgent"].lower() == self.address.lower() and
                        t["status"] in (int(TaskStatus.Assigned), int(TaskStatus.InProgress))):
                    self._active_tasks.add(tid)
                    asyncio.create_task(self._run_task(tid, t))
        except Exception as e:
            self.log.error(f"[SimulationAgent] Poll error: {e}")

    async def _run_task(self, task_id: int, task: dict):
        try:
            result = await self.execute_task(task)
            await self.submit_result(
                task_id,
                json.dumps({"result": result, "agent": self.address, "type": "simulation"})
            )
            self._active_tasks.discard(task_id)
        except Exception as e:
            self.log.error(f"[SimulationAgent] Task #{task_id} failed: {e}")
            self._active_tasks.discard(task_id)
            self._failed_tasks.add(task_id)


async def main():
    from dotenv import load_dotenv
    load_dotenv(override=True)

    config = AgentConfig(
        name="AuraGuard-Simulation",
        capabilities=[Capability.CodeGen],
        private_key=os.environ["SIMULATION_AGENT_KEY"],
        rpc_url=os.environ.get("SOMNIA_RPC_URL", "https://api.infra.testnet.somnia.network/"),
        registry_address=os.environ["REGISTRY_ADDRESS"],
        task_market_address=os.environ["MARKET_ADDRESS"],
    )

    agent = SimulationAgent(config)
    agent.setup_contracts(config.registry_address, config.task_market_address)
    await agent.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [SIMULATION] %(message)s")
    asyncio.run(main())
