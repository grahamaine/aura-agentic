"""
SecurityAgent — AuraGuard Static Vulnerability Scanner

Performs deep static analysis of smart contract code and bytecode
using Claude as the AI brain. Detects:
  - Reentrancy vulnerabilities
  - Unlimited mint / supply manipulation
  - Access control flaws (missing onlyOwner, tx.origin auth)
  - Honeypot patterns (blacklists, forced reverts, hidden taxes)
  - Integer overflow / underflow
  - Dangerous delegatecall / selfdestruct patterns
  - Unchecked external calls

This agent bids on tasks requiring Capability.Analysis that come
from AuditOrchestrator's sub-task decomposition.
"""

import asyncio
import json
import logging
import os
import time

from dotenv import load_dotenv

from .base_agent import BaseAgent, AgentConfig, Capability, TaskStatus

load_dotenv(override=True)

log = logging.getLogger("security_agent")

# ── Prompt engineering ─────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are SecurityAgent, an elite smart contract security specialist in the AuraGuard protocol.
You are a world-class auditor with expertise in Solidity vulnerabilities, DeFi exploits, and rug-pull patterns.

Your mission: Protect crypto users from losing money to malicious or vulnerable contracts.

You analyze contract code, ABI, and on-chain data to identify:
1. CRITICAL vulnerabilities (certain exploit/rug) — riskScore contribution: 80-100
2. HIGH vulnerabilities (likely exploit path) — riskScore contribution: 60-80
3. MEDIUM vulnerabilities (exploit under specific conditions) — riskScore contribution: 40-60
4. LOW concerns (best-practice violations) — riskScore contribution: 10-40
5. INFO (interesting but not dangerous) — riskScore contribution: 0-10

Return ONLY valid JSON. No markdown. No preamble."""

SCAN_PROMPT = """Perform a comprehensive security audit on this smart contract.

CONTRACT ADDRESS: {contract_address}
DEPLOYER WALLET: {deployer}
TRANSACTION HASH: {tx_hash}
BLOCK NUMBER: {block_number}
TIMESTAMP: {timestamp}

CONTRACT BYTECODE (hex): {bytecode}

KNOWN ABI FUNCTIONS (if decodable): {abi_functions}

SCAN FOR:
1. Unlimited mint / backdoor mint functions
2. Hidden transfer taxes (configurable by owner)
3. Sell blacklists or honeypot traps
4. LP drain / liquidity removal backdoors
5. Reentrancy vulnerabilities (missing ReentrancyGuard)
6. Missing access control (functions callable by anyone)
7. Ownership renounce disabled
8. Self-destruct / delegatecall dangers
9. Integer overflow/underflow
10. Unchecked external calls
11. Flash loan attack vectors
12. Price oracle manipulation potential
13. Proxy upgrade backdoors (can change logic contract)
14. Pausable token (owner can freeze transfers)

For each vulnerability found, provide:
- Exact vulnerability name/category
- Severity (CRITICAL/HIGH/MEDIUM/LOW/INFO)
- Explanation of attack vector
- Estimated financial risk to users

Calculate a STATIC_RISK_SCORE (0-100) based on:
- Number and severity of vulnerabilities
- Combination of vulnerabilities (e.g., blacklist + tax = honeypot = CRITICAL boost)
- Presence of any single instant-rug pattern = minimum score 90

Return this exact JSON structure:
{{
  "contract_address": "{contract_address}",
  "static_risk_score": <0-100>,
  "confidence": <0-100>,
  "verdict": "SAFE|LOW|MEDIUM|HIGH|CRITICAL",
  "instant_rug_detected": true/false,
  "vulnerabilities": [
    {{
      "id": "VULN-001",
      "category": "Unlimited Mint",
      "severity": "CRITICAL",
      "function_signature": "mint(address,uint256)",
      "description": "Owner can mint unlimited tokens with no cap or timelock.",
      "attack_vector": "Owner mints massive supply post-listing, diluting holders.",
      "risk_to_users": "Total loss of investment value"
    }}
  ],
  "safe_functions": ["transfer", "approve"],
  "dangerous_functions": ["mint", "setSellTax", "drainLiquidity"],
  "summary": "<one sentence verdict for dashboard display>",
  "full_report": "<detailed audit report in plain English>"
}}"""


class SecurityAgent(BaseAgent):
    """
    Static vulnerability scanner.
    Analyzes contract bytecode and ABI for exploit patterns.
    Registers with Analysis capability — AuditOrchestrator posts sub-tasks for this.
    """

    def __init__(self, config: AgentConfig):
        config.capabilities = [Capability.Analysis]
        super().__init__(config)
        self._active_tasks: set[int] = set()
        self._failed_tasks: set[int] = set()

    async def _should_bid(self, task: dict) -> bool:
        """Only bid on security-related analysis tasks."""
        title = task.get("title", "").lower()
        description = task.get("description", "").lower()
        security_keywords = [
            "security", "audit", "scan", "vulnerability", "contract",
            "aura guard", "aura_guard", "risk", "rug", "exploit",
        ]
        return any(kw in title or kw in description for kw in security_keywords)

    async def execute_task(self, task: dict) -> str:
        self.log.info(f"[SecurityAgent] Scanning contract — Task #{task['id']}: {task['title']}")

        # Parse input
        input_data = {}
        try:
            input_data = json.loads(task["inputData"])
        except Exception:
            input_data = {"contract_address": task["inputData"]}

        contract_address = input_data.get("contract_address", "unknown")
        deployer         = input_data.get("deployer", "unknown")
        tx_hash          = input_data.get("tx_hash", "unknown")
        block_number     = input_data.get("block_number", "unknown")
        timestamp        = input_data.get("timestamp", time.time())

        # Fetch bytecode from chain
        bytecode = await self._fetch_bytecode(contract_address)

        # Decode common function signatures from bytecode
        abi_functions = self._decode_function_sigs(bytecode)

        prompt = SCAN_PROMPT.format(
            contract_address=contract_address,
            deployer=deployer,
            tx_hash=tx_hash,
            block_number=block_number,
            timestamp=timestamp,
            bytecode=bytecode[:4000] if bytecode else "NOT_AVAILABLE",
            abi_functions=json.dumps(abi_functions),
        )

        self.log.info(f"[SecurityAgent] Running AI security analysis on {contract_address}...")
        raw = await self.think_async(SYSTEM_PROMPT, prompt, max_tokens=4096)

        # Parse and validate result
        try:
            result = json.loads(raw)
            result["agent"] = self.address
            result["agent_type"] = "SecurityAgent"
            result["scan_timestamp"] = time.time()
            self.stats["tasks_completed"] += 1
            self.log.info(
                f"[SecurityAgent] ✅ Scan complete — "
                f"RiskScore: {result.get('static_risk_score', '?')}/100 | "
                f"Verdict: {result.get('verdict', '?')} | "
                f"Vulns: {len(result.get('vulnerabilities', []))}"
            )
            return json.dumps(result)
        except json.JSONDecodeError:
            # Return structured fallback
            fallback = {
                "contract_address": contract_address,
                "static_risk_score": 50,
                "confidence": 30,
                "verdict": "MEDIUM",
                "instant_rug_detected": False,
                "vulnerabilities": [],
                "summary": "Static analysis inconclusive — manual review recommended.",
                "raw_output": raw[:500],
                "agent": self.address,
                "agent_type": "SecurityAgent",
                "parse_error": True,
            }
            self.log.warning(f"[SecurityAgent] ⚠️ Could not parse Claude output, using fallback")
            return json.dumps(fallback)

    async def _fetch_bytecode(self, contract_address: str) -> str:
        """Fetch deployed bytecode from Somnia chain."""
        try:
            from web3 import Web3
            addr = Web3.to_checksum_address(contract_address)
            code = await self.w3.eth.get_code(addr)
            return code.hex() if code else ""
        except Exception as e:
            self.log.warning(f"[SecurityAgent] Could not fetch bytecode for {contract_address}: {e}")
            return ""

    def _decode_function_sigs(self, bytecode: str) -> list[str]:
        """
        Extract 4-byte function selectors from bytecode and attempt to match
        against a dictionary of known dangerous function signatures.
        """
        KNOWN_DANGEROUS = {
            "40c10f19": "mint(address,uint256)",
            "a9059cbb": "transfer(address,uint256)",
            "23b872dd": "transferFrom(address,address,uint256)",
            "f2fde38b": "transferOwnership(address)",
            "715018a6": "renounceOwnership()",
            "dd62ed3e": "allowance(address,address)",
            "095ea7b3": "approve(address,uint256)",
            "70a08231": "balanceOf(address)",
            "313ce567": "decimals()",
            "06fdde03": "name()",
            "8da5cb5b": "owner()",
            "95d89b41": "symbol()",
            "18160ddd": "totalSupply()",
            "5c975abb": "paused()",
            "8456cb59": "pause()",
            "3f4ba83a": "unpause()",
            "42966c68": "burn(uint256)",
            "a0712d68": "mint(uint256)",
            "1e9a6950": "burn(address,uint256)",
            "3ccfd60b": "withdraw()",
            "d0e30db0": "deposit()",
            "e2d2e21c": "setSellTax(uint256)",
            "44df8e70": "drainLiquidity()",
            "16c021c9": "setBlacklist(address,bool)",
            "e6f9eacc": "setLiquidityPool(address)",
        }

        found = []
        if not bytecode:
            return found

        for selector, name in KNOWN_DANGEROUS.items():
            if selector in bytecode:
                found.append(name)

        return found

    async def _check_assigned_tasks(self):
        try:
            count = await self._market.functions.taskCount().call()
            for tid in range(max(1, count - 50), count + 1):  # only check last 50
                if tid in self._active_tasks or tid in self._failed_tasks:
                    continue
                t = await self.get_task(tid)
                if (t["assignedAgent"].lower() == self.address.lower() and
                        t["status"] in (int(TaskStatus.Assigned), int(TaskStatus.InProgress))):
                    self._active_tasks.add(tid)
                    asyncio.create_task(self._run_task(tid, t))
        except Exception as e:
            self.log.error(f"[SecurityAgent] Poll error: {e}")

    async def _run_task(self, task_id: int, task: dict):
        try:
            result = await self.execute_task(task)
            result_payload = json.dumps({
                "result": result,
                "agent": self.address,
                "type": "security_scan"
            })
            await self.submit_result(task_id, result_payload)
            self._active_tasks.discard(task_id)
        except Exception as e:
            self.log.error(f"[SecurityAgent] Task #{task_id} failed: {e}")
            self._active_tasks.discard(task_id)
            self._failed_tasks.add(task_id)


# ── Standalone entrypoint ──────────────────────────────────────────────────────

async def main():
    from dotenv import load_dotenv
    load_dotenv(override=True)

    config = AgentConfig(
        name="AuraGuard-Security",
        capabilities=[Capability.Analysis],
        private_key=os.environ["SECURITY_AGENT_KEY"],
        rpc_url=os.environ.get("SOMNIA_RPC_URL", "https://api.infra.testnet.somnia.network/"),
        registry_address=os.environ["REGISTRY_ADDRESS"],
        task_market_address=os.environ["MARKET_ADDRESS"],
    )

    agent = SecurityAgent(config)
    agent.setup_contracts(config.registry_address, config.task_market_address)
    await agent.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [SECURITY] %(message)s")
    asyncio.run(main())
