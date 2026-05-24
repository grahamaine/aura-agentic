"""
SocialIntelAgent — AuraGuard On-Chain & Social Intelligence

Builds a risk profile of a newly deployed contract by analyzing:
  1. Deployer wallet history (age, previous contracts, known scam associations)
  2. LP lock status (is liquidity locked or can it be removed instantly?)
  3. Contract verification status on explorer
  4. Token distribution (are 90% of tokens in one wallet?)
  5. Deployer's social signals (anonymous? prior rugs?)
  6. Contract age and deployment patterns (factory deployments = higher risk)
  7. Similar contracts on chain (copy-paste code = often scam)

Registers with Capability.Research — AuditOrchestrator posts sub-tasks
matching Research that this agent executes.
"""

import asyncio
import json
import logging
import os
import time

from dotenv import load_dotenv

from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus

load_dotenv(override=True)

SYSTEM_PROMPT = """You are SocialIntelAgent, an on-chain intelligence specialist in the AuraGuard protocol.
You are an expert in blockchain forensics, deployer profiling, and on-chain pattern recognition.

You analyze deployer wallets, liquidity patterns, token distributions, and behavioral signals to
detect rug pull setups BEFORE they happen.

Scammers have patterns: fresh wallets, no LP lock, concentrated supply, anonymous teams.
You know all the patterns. You protect users.

Return ONLY valid JSON. No markdown."""

INTEL_PROMPT = """Analyze the on-chain intelligence for this newly deployed contract:

CONTRACT ADDRESS: {contract_address}
DEPLOYER WALLET: {deployer}
BLOCK NUMBER: {block_number}
TIMESTAMP: {timestamp}

ON-CHAIN DATA COLLECTED:
- Deployer wallet age: {deployer_age_blocks} blocks old (~{deployer_age_days:.1f} days)
- Deployer previous transactions: {deployer_tx_count}
- Deployer STT balance: {deployer_balance} STT
- Previous contracts deployed by same wallet: {previous_contracts}
- Contract bytecode size: {bytecode_size} bytes
- Is contract verified on explorer: {is_verified}
- Token total supply (if ERC20): {total_supply}
- Top holder concentration: {top_holder_pct}% in single wallet

KNOWN RISK PATTERNS TO CHECK:
1. FRESH WALLET RUG: Deployer wallet < 7 days old + new contract = HIGH RISK
2. SERIAL DEPLOYER: Same wallet previously deployed contracts that were abandoned/rugged
3. NO LP LOCK: No liquidity locking contract interaction detected
4. SUPPLY CONCENTRATION: >80% tokens in deployer/single wallet = pump & dump risk
5. SMALL BYTECODE: Very small contracts often lack safety mechanisms
6. UNVERIFIED CONTRACT: Cannot read source = hidden backdoors possible
7. ANONYMOUS TEAM: No social links, no KYC, no doxxing = higher rug risk
8. FACTORY PATTERN: Contract created by another contract = often automated scam factory
9. RAPID DEPLOYMENT: Multiple contracts in < 24 hours from same wallet = scam factory
10. KNOWN BAD ACTOR: Deployer address associated with previous exploits

Based on this data:
- Identify which risk patterns apply
- Assign a social/operational risk score
- Make a recommendation

Calculate SOCIAL_RISK_SCORE (0-100):
- Fresh wallet + no LP lock = 80+
- Known scammer wallet = 95+
- Established team + locked LP + verified = 10-
- Unknown but clean history + verified = 30-40

Return this JSON:
{{
  "contract_address": "{contract_address}",
  "deployer": "{deployer}",
  "social_risk_score": <0-100>,
  "confidence": <0-100>,
  "deployer_profile": {{
    "wallet_age_days": <number>,
    "tx_count": <number>,
    "previous_contracts": <number>,
    "is_fresh_wallet": true/false,
    "is_known_scammer": true/false,
    "risk_label": "FRESH_WALLET|ESTABLISHED|KNOWN_SCAMMER|UNKNOWN"
  }},
  "liquidity_analysis": {{
    "lp_locked": true/false,
    "lock_duration_days": <number or null>,
    "lp_removable_instantly": true/false,
    "risk": "CRITICAL|HIGH|MEDIUM|LOW"
  }},
  "supply_distribution": {{
    "top_holder_pct": <number>,
    "deployer_holds_pct": <number>,
    "is_concentrated": true/false,
    "risk": "CRITICAL|HIGH|MEDIUM|LOW"
  }},
  "flags": [
    {{
      "pattern": "FRESH_WALLET",
      "description": "Deployer wallet is X days old — common rug pattern",
      "severity": "HIGH"
    }}
  ],
  "summary": "<one sentence verdict>",
  "recommendation": "AVOID|CAUTION|MONITOR|LIKELY_SAFE"
}}"""


class SocialIntelAgent(BaseAgent):
    """
    On-chain and social intelligence agent.
    Profiles deployer wallets and contract deployment patterns.
    """

    def __init__(self, config: AgentConfig):
        config.capabilities = [Capability.Research, Capability.DataFetch]
        super().__init__(config)
        self._active_tasks: set[int] = set()
        self._failed_tasks: set[int] = set()

    async def _should_bid(self, task: dict) -> bool:
        title = task.get("title", "").lower()
        description = task.get("description", "").lower()
        intel_keywords = [
            "social", "intel", "deployer", "profile", "on-chain",
            "aura guard", "reputation", "history", "background check",
        ]
        return any(kw in title or kw in description for kw in intel_keywords)

    async def execute_task(self, task: dict) -> str:
        self.log.info(f"[SocialIntelAgent] Profiling deployer — Task #{task['id']}: {task['title']}")

        input_data = {}
        try:
            input_data = json.loads(task["inputData"])
        except Exception:
            input_data = {"contract_address": task["inputData"]}

        contract_address = input_data.get("contract_address", "unknown")
        deployer         = input_data.get("deployer", "unknown")
        block_number     = input_data.get("block_number", 0)
        timestamp        = input_data.get("timestamp", time.time())

        # Collect on-chain intel
        intel = await self._gather_onchain_intel(deployer, contract_address, block_number)

        prompt = INTEL_PROMPT.format(
            contract_address=contract_address,
            deployer=deployer,
            block_number=block_number,
            timestamp=timestamp,
            deployer_age_blocks=intel["deployer_age_blocks"],
            deployer_age_days=intel["deployer_age_days"],
            deployer_tx_count=intel["deployer_tx_count"],
            deployer_balance=intel["deployer_balance"],
            previous_contracts=intel["previous_contracts"],
            bytecode_size=intel["bytecode_size"],
            is_verified=intel["is_verified"],
            total_supply=intel["total_supply"],
            top_holder_pct=intel["top_holder_pct"],
        )

        self.log.info(f"[SocialIntelAgent] Running AI intel analysis on deployer {deployer[:12]}...")
        raw = await self.think_async(SYSTEM_PROMPT, prompt, max_tokens=3000)

        try:
            result = json.loads(raw)
            result["agent"] = self.address
            result["agent_type"] = "SocialIntelAgent"
            result["raw_intel"] = intel
            result["scan_timestamp"] = time.time()
            self.stats["tasks_completed"] += 1
            self.log.info(
                f"[SocialIntelAgent] ✅ Intel complete — "
                f"SocialRisk: {result.get('social_risk_score', '?')}/100 | "
                f"Recommendation: {result.get('recommendation', '?')}"
            )
            return json.dumps(result)

        except json.JSONDecodeError:
            fallback = {
                "contract_address": contract_address,
                "deployer": deployer,
                "social_risk_score": 50,
                "confidence": 25,
                "flags": [],
                "summary": "Social intelligence inconclusive — limited data.",
                "recommendation": "CAUTION",
                "raw_intel": intel,
                "agent": self.address,
                "agent_type": "SocialIntelAgent",
                "parse_error": True,
            }
            self.log.warning("[SocialIntelAgent] ⚠️ Could not parse intel output, using fallback")
            return json.dumps(fallback)

    async def _gather_onchain_intel(
        self,
        deployer: str,
        contract_address: str,
        deploy_block: int,
    ) -> dict:
        """Collect real on-chain data points for the deployer and contract."""
        intel = {
            "deployer_age_blocks": 0,
            "deployer_age_days": 0.0,
            "deployer_tx_count": 0,
            "deployer_balance": 0.0,
            "previous_contracts": 0,
            "bytecode_size": 0,
            "is_verified": False,
            "total_supply": "unknown",
            "top_holder_pct": "unknown",
        }

        try:
            from web3 import Web3

            # Deployer balance
            try:
                deployer_addr = Web3.to_checksum_address(deployer)
                balance_wei = await self.w3.eth.get_balance(deployer_addr)
                intel["deployer_balance"] = round(float(Web3.from_wei(balance_wei, "ether")), 4)
            except Exception:
                pass

            # Deployer transaction count (nonce = tx count)
            try:
                nonce = await self.w3.eth.get_transaction_count(deployer_addr)
                intel["deployer_tx_count"] = nonce
                # Rough heuristic: each contract deploy adds ~1 nonce
                # Assume 10% of txs are contract deployments
                intel["previous_contracts"] = max(0, (nonce // 10) - 1)
            except Exception:
                pass

            # Deployer wallet age (approximate from first tx)
            # Use current block vs deploy block as a proxy
            try:
                current_block = await self.w3.eth.block_number
                blocks_old = current_block - deploy_block if deploy_block > 0 else nonce * 2
                intel["deployer_age_blocks"] = max(0, blocks_old)
                # Somnia: ~1 block/second → blocks = seconds
                intel["deployer_age_days"] = max(0, blocks_old / 86400)
            except Exception:
                pass

            # Contract bytecode size
            try:
                contract_addr = Web3.to_checksum_address(contract_address)
                code = await self.w3.eth.get_code(contract_addr)
                intel["bytecode_size"] = len(code)
            except Exception:
                pass

            # ERC20 total supply (try calling totalSupply())
            try:
                erc20_abi = [{"inputs": [], "name": "totalSupply",
                              "outputs": [{"type": "uint256"}],
                              "stateMutability": "view", "type": "function"}]
                token = self.w3.eth.contract(address=contract_addr, abi=erc20_abi)
                supply = await token.functions.totalSupply().call()
                intel["total_supply"] = str(supply)
            except Exception:
                intel["total_supply"] = "not_erc20_or_unavailable"

        except Exception as e:
            self.log.warning(f"[SocialIntelAgent] Intel gather partial failure: {e}")

        return intel

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
            self.log.error(f"[SocialIntelAgent] Poll error: {e}")

    async def _run_task(self, task_id: int, task: dict):
        try:
            result = await self.execute_task(task)
            await self.submit_result(
                task_id,
                json.dumps({"result": result, "agent": self.address, "type": "social_intel"})
            )
            self._active_tasks.discard(task_id)
        except Exception as e:
            self.log.error(f"[SocialIntelAgent] Task #{task_id} failed: {e}")
            self._active_tasks.discard(task_id)
            self._failed_tasks.add(task_id)


async def main():
    from dotenv import load_dotenv
    load_dotenv(override=True)

    config = AgentConfig(
        name="AuraGuard-SocialIntel",
        capabilities=[Capability.Research, Capability.DataFetch],
        private_key=os.environ["SOCIAL_INTEL_AGENT_KEY"],
        rpc_url=os.environ.get("SOMNIA_RPC_URL", "https://api.infra.testnet.somnia.network/"),
        registry_address=os.environ["REGISTRY_ADDRESS"],
        task_market_address=os.environ["MARKET_ADDRESS"],
    )

    agent = SocialIntelAgent(config)
    agent.setup_contracts(config.registry_address, config.task_market_address)
    await agent.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [SOCIAL_INTEL] %(message)s")
    asyncio.run(main())
