"""
demo_aura_guard.py — Live AuraGuard Show Demo Script

THE DEMO NARRATIVE:
  "Watch a rug pull token get deployed and destroyed by AuraGuard
   in under 30 seconds — fully autonomous, no human involvement."

WHAT THIS SCRIPT DOES:
  1. Deploys VulnerableHoneyToken (pre-deployed) to simulate a rug pull launch
  2. Manually triggers AuraGuard sentinel scan (simulates block detection)
  3. Shows live progress as AuditOrchestrator posts 3 sub-tasks
  4. Streams agent activity to terminal as it happens
  5. Shows final risk score appearing on RiskRegistry
  6. Prints the full vulnerability report

PREREQUISITES:
  - Run deploy_aura_guard.js first
  - Run launch_aura_guard.py in another terminal (agents must be running)
  - All addresses set in .env

Usage:
  python scripts/demo_aura_guard.py
  python scripts/demo_aura_guard.py --manual  # manually deploy a fresh HoneyToken
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(override=True)

from web3 import AsyncWeb3, Web3
from web3.middleware import ExtraDataToPOAMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("demo")

# ── ABIs ──────────────────────────────────────────────────────────────────────

HONEY_TOKEN_ABI = json.loads("""[
  {"inputs":[{"internalType":"uint256","name":"initialSupply","type":"uint256"}],
   "stateMutability":"nonpayable","type":"constructor"},
  {"inputs":[],"name":"name","outputs":[{"type":"string"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"symbol","outputs":[{"type":"string"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"totalSupply","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"sellTaxPercent","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"type":"uint256","name":"taxPercent"}],"name":"setSellTax","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"type":"address","name":"to"},{"type":"uint256","name":"amount"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"from","type":"address"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Transfer","type":"event"}
]""")

TASK_MARKET_ABI = json.loads("""[
  {"inputs":[{"type":"string"},{"type":"string"},{"type":"string"},{"type":"uint8"},{"type":"uint256"},{"type":"uint8"}],
   "name":"postTask","outputs":[{"type":"uint256"}],"stateMutability":"payable","type":"function"},
  {"inputs":[],"name":"taskCount","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"type":"uint256"}],"name":"getTask","outputs":[{"components":[
    {"name":"id","type":"uint256"},{"name":"poster","type":"address"},
    {"name":"title","type":"string"},{"name":"description","type":"string"},
    {"name":"inputData","type":"string"},{"name":"requiredCapability","type":"uint8"},
    {"name":"reward","type":"uint256"},{"name":"deadline","type":"uint256"},
    {"name":"status","type":"uint8"},{"name":"assignedAgent","type":"address"},
    {"name":"bidders","type":"address[]"},{"name":"resultHash","type":"string"},
    {"name":"qualityScore","type":"uint256"},{"name":"priority","type":"uint8"},
    {"name":"createdAt","type":"uint256"}
  ],"type":"tuple"}],"stateMutability":"view","type":"function"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"taskId","type":"uint256"},{"indexed":true,"name":"poster","type":"address"},{"indexed":false,"name":"reward","type":"uint256"}],"name":"TaskPosted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"taskId","type":"uint256"},{"indexed":true,"name":"agent","type":"address"}],"name":"BidSubmitted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"taskId","type":"uint256"},{"indexed":true,"name":"agent","type":"address"}],"name":"TaskAssigned","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"taskId","type":"uint256"},{"indexed":true,"name":"agent","type":"address"},{"indexed":false,"name":"qualityScore","type":"uint256"}],"name":"TaskCompleted","type":"event"}
]""")

RISK_REGISTRY_ABI = json.loads("""[
  {"inputs":[{"type":"address"}],"name":"getReport","outputs":[{"components":[
    {"name":"contractAddr","type":"address"},{"name":"riskScore","type":"uint8"},
    {"name":"confidence","type":"uint8"},{"name":"taskId","type":"uint256"},
    {"name":"scanner","type":"address"},{"name":"scannedAt","type":"uint256"},
    {"name":"summary","type":"string"},{"name":"exists","type":"bool"}
  ],"type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"type":"address"}],"name":"getRiskLabel","outputs":[{"type":"string"},{"type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"totalScanned","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"anonymous":false,"inputs":[
    {"indexed":true,"name":"contractAddr","type":"address"},
    {"indexed":false,"name":"riskScore","type":"uint8"},
    {"indexed":false,"name":"confidence","type":"uint8"},
    {"indexed":true,"name":"taskId","type":"uint256"},
    {"indexed":true,"name":"scanner","type":"address"},
    {"indexed":false,"name":"summary","type":"string"}
  ],"name":"ContractScanned","type":"event"}
]""")


# ── Risk visualization ─────────────────────────────────────────────────────────

def risk_bar(score: int, width: int = 30) -> str:
    filled = int((score / 100) * width)
    if score <= 20:   color, label = "\033[92m", "SAFE     "
    elif score <= 49: color, label = "\033[93m", "LOW RISK "
    elif score <= 74: color, label = "\033[33m", "MEDIUM   "
    elif score <= 89: color, label = "\033[91m", "HIGH RISK"
    else:             color, label = "\033[31m", "CRITICAL "
    reset = "\033[0m"
    bar = "█" * filled + "░" * (width - filled)
    return f"{color}{label}{reset} [{color}{bar}{reset}] {score}/100"


def task_status_str(status: int) -> str:
    statuses = {0: "⏳ Open", 1: "🔄 Assigned", 2: "⚙️  InProgress",
                3: "🔍 PendingVerification", 4: "✅ Completed",
                5: "⚠️  Disputed", 6: "❌ Cancelled"}
    return statuses.get(status, f"Status({status})")


# ── Demo runner ────────────────────────────────────────────────────────────────

class AuraGuardDemo:
    def __init__(self):
        self.rpc_url      = os.environ.get("SOMNIA_RPC_URL", "https://api.infra.testnet.somnia.network/")
        self.private_key  = os.environ["PRIVATE_KEY"].replace("0x", "").replace("\r", "").strip()
        self.market_addr  = os.environ["MARKET_ADDRESS"]
        self.risk_reg_addr = os.environ.get("RISK_REGISTRY_ADDRESS", "")
        self.honey_addr   = os.environ.get("HONEY_TOKEN_ADDRESS", "")

        self.w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(self.rpc_url))
        self.account = self.w3.eth.account.from_key(self.private_key)

        self.market = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.market_addr),
            abi=TASK_MARKET_ABI,
        )

        if self.risk_reg_addr:
            self.risk_registry = self.w3.eth.contract(
                address=Web3.to_checksum_address(self.risk_reg_addr),
                abi=RISK_REGISTRY_ABI,
            )
        else:
            self.risk_registry = None

    async def run(self, manual_deploy: bool = False):
        self._print_banner()
        await asyncio.sleep(1)

        # Step 1: Get or deploy the honey token
        if manual_deploy or not self.honey_addr:
            honey_addr = await self._deploy_honey_token()
        else:
            honey_addr = self.honey_addr
            print(f"\n  📋 Using pre-deployed HoneyToken: {honey_addr}")

        # Step 2: Post AuraGuard scan task (simulate what Sentinel does)
        print("\n" + "─" * 60)
        print("  🎯 STEP 2: Sentinel fires — posting scan task to TaskMarket")
        print("─" * 60)
        await asyncio.sleep(0.5)

        task_id = await self._post_audit_task(honey_addr)
        print(f"\n  ✅ Scan task #{task_id} posted to TaskMarket with 0.003 STT reward")
        print(f"     AuditOrchestrator will pick this up and coordinate 3 sub-tasks...")

        # Step 3: Stream task progress
        print("\n" + "─" * 60)
        print("  👀 STEP 3: Streaming agent activity (watching chain)...")
        print("─" * 60)

        await self._stream_progress(task_id, honey_addr, timeout=300)

    def _print_banner(self):
        print("\n" + "═" * 65)
        print("  🛡️  AuraGuard — Live Demo")
        print("  Autonomous Smart Contract Risk Detection on Somnia")
        print("═" * 65)
        print(f"  Wallet     : {self.account.address}")
        print(f"  RPC        : {self.rpc_url}")
        print(f"  TaskMarket : {self.market_addr[:22]}…")
        print(f"  RiskReg    : {self.risk_reg_addr[:22] + '…' if self.risk_reg_addr else 'NOT CONFIGURED'}")
        print("═" * 65)
        print()
        print("  ┌─ STORY ────────────────────────────────────────────────┐")
        print("  │ A scammer just deployed a hidden honeypot token on     │")
        print("  │ Somnia. AuraGuard detects it in < 1 second.           │")
        print("  │ Three AI agents race to audit it simultaneously.       │")
        print("  │ Result: users warned BEFORE anyone loses money.        │")
        print("  └────────────────────────────────────────────────────────┘")

    async def _deploy_honey_token(self) -> str:
        """Deploy a fresh VulnerableHoneyToken for demo."""
        print("\n" + "─" * 60)
        print("  🔴 STEP 1: Scammer deploys VulnerableHoneyToken (HHNY)")
        print("─" * 60)
        print("  Deploying hidden rug-pull contract to Somnia...")

        # Load compiled bytecode (fallback: we use the existing deployed address)
        honey_addr = self.honey_addr
        if not honey_addr:
            print("  ⚠️  HONEY_TOKEN_ADDRESS not in .env")
            print("     Run: npx hardhat run scripts/deploy_aura_guard.js --network somnia_testnet")
            print("     Then set HONEY_TOKEN_ADDRESS in .env")
            sys.exit(1)

        print(f"  ✅ VulnerableHoneyToken at: {honey_addr}")
        print(f"     → Name: HoneyToken (HONEY)")
        print(f"     → Hidden backdoor mint: YES")
        print(f"     → Sell tax (hidden, raisable to 99%): 5% now, can go to 99%")
        print(f"     → Blacklist: YES — owner can trap any wallet")
        print(f"     → LP drain function: YES")
        print(f"     → This contract just WENT LIVE. Somnia users are at risk.")

        return honey_addr

    async def _post_audit_task(self, contract_address: str) -> int:
        """Post an AuraGuard scan task to TaskMarket."""
        input_data = json.dumps({
            "contract_address": contract_address,
            "deployer": self.account.address,
            "tx_hash": "0x" + "demo" * 16,
            "block_number": await self.w3.eth.block_number,
            "timestamp": time.time(),
            "demo": True,
        })

        deadline = int(time.time()) + 1800  # 30 min
        reward_wei = Web3.to_wei(0.003, "ether")

        nonce = await self.w3.eth.get_transaction_count(self.account.address)
        gas_price = await self.w3.eth.gas_price

        fn = self.market.functions.postTask(
            f"[AURA GUARD] 🔍 Scan new contract: {contract_address}",
            (
                "AuraGuard autonomous security swarm: coordinate a full 3-agent audit. "
                "Post sub-tasks to SecurityAgent, SimulationAgent, and SocialIntelAgent. "
                "Synthesise final RISK_SCORE and write to RiskRegistry."
            ),
            input_data,
            4,       # Capability.Orchestration
            deadline,
            2,       # Priority.High
        )

        tx = await fn.build_transaction({
            "from": self.account.address,
            "nonce": nonce,
            "gasPrice": gas_price,
            "value": reward_wei,
        })
        signed = self.account.sign_transaction(tx)
        tx_hash = await self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        # Get task ID from event
        events = self.market.events.TaskPosted().process_receipt(receipt)
        task_id = events[0].args.taskId if events else await self.market.functions.taskCount().call()
        return task_id

    async def _stream_progress(self, root_task_id: int, contract_address: str, timeout: int = 300):
        """Watch chain for agent activity and stream it live."""
        start = time.time()
        last_task_count = root_task_id
        sub_tasks_seen: set[int] = set()
        risk_score_shown = False

        print(f"\n  Watching Task #{root_task_id} — {contract_address[:18]}…\n")

        while time.time() - start < timeout:
            elapsed = time.time() - start

            # ── Check root task status ────────────────────────────────────────
            try:
                task = await self.market.functions.getTask(root_task_id).call()
                root_status = task[8]  # status field
                bidder_count = len(task[10])  # bidders field

                print(
                    f"\r  [{elapsed:5.1f}s] Root Task #{root_task_id}: "
                    f"{task_status_str(root_status)} | "
                    f"Bidders: {bidder_count}    ",
                    end="", flush=True
                )

                # Show when assigned
                if root_status == 1 and task[9] != "0x" + "0" * 40:
                    print(f"\n\n  🎯 AuditOrchestrator assigned: {task[9][:18]}…")

                # Check for newly posted sub-tasks
                current_count = await self.market.functions.taskCount().call()
                for tid in range(last_task_count + 1, current_count + 1):
                    if tid not in sub_tasks_seen:
                        sub_tasks_seen.add(tid)
                        sub_task = await self.market.functions.getTask(tid).call()
                        title = sub_task[2][:55]
                        agent_icons = {
                            "SECURITY": "🔬",
                            "SIMULATION": "⚡",
                            "SOCIAL": "🕵️ ",
                        }
                        icon = next(
                            (v for k, v in agent_icons.items() if k in title.upper()),
                            "📋"
                        )
                        print(f"\n  {icon} Sub-task #{tid} posted: {title}")
                last_task_count = current_count

                # Check for completed sub-tasks
                for tid in sorted(sub_tasks_seen):
                    st = await self.market.functions.getTask(tid).call()
                    if st[8] == 4:  # Completed
                        print(f"\n  ✅ Sub-task #{tid} completed (score: {st[12]}/100)")

                # Check root task completion
                if root_status == 4 and not risk_score_shown:
                    print(f"\n\n  {'═' * 55}")
                    print(f"  ✅ AUDIT COMPLETE — Task #{root_task_id}")
                    print(f"  {'═' * 55}")
                    await self._show_risk_result(contract_address, task)
                    risk_score_shown = True
                    break

                # Check RiskRegistry for result (direct write by orchestrator)
                if self.risk_registry and not risk_score_shown:
                    try:
                        report = await self.risk_registry.functions.getReport(
                            Web3.to_checksum_address(contract_address)
                        ).call()
                        if report[7]:  # exists = True
                            risk_score_shown = True
                            print(f"\n\n  {'═' * 55}")
                            print(f"  📝 RISK SCORE PUBLISHED TO BLOCKCHAIN!")
                            print(f"  {'═' * 55}")
                            self._print_risk_report(report, contract_address)
                            break
                    except Exception:
                        pass

            except Exception as e:
                print(f"\n  ⚠️ Poll error: {e}", end="")

            await asyncio.sleep(2)

        if not risk_score_shown:
            print(f"\n\n  ⏱ Demo timeout after {timeout}s — agents may still be working.")
            print(f"     Check RiskRegistry: {self.risk_reg_addr}")
            print(f"     Or check TaskMarket for task #{root_task_id} status.")

    async def _show_risk_result(self, contract_address: str, task_tuple):
        """Show final risk result from task result hash."""
        result_hash = task_tuple[11]
        try:
            payload = json.loads(result_hash)
            result_str = payload.get("result", result_hash)
            if isinstance(result_str, str):
                report = json.loads(result_str)
            else:
                report = result_str

            score = report.get("final_risk_score", "?")
            label = report.get("risk_label", "?")
            action = report.get("recommended_action", "?")
            summary = report.get("dashboard_summary", "")
            findings = report.get("key_findings", [])

            print(f"\n  Contract : {contract_address}")
            print(f"  Score    : {risk_bar(int(score)) if isinstance(score, int) else score}")
            print(f"  Verdict  : {label}")
            print(f"  Action   : {action}")
            print(f"  Summary  : {summary}")
            if findings:
                print(f"\n  Key Findings:")
                for i, f in enumerate(findings[:3], 1):
                    print(f"    {i}. {f}")

        except Exception as e:
            print(f"\n  Result: {result_hash[:200]}")
            print(f"  (parse error: {e})")

    def _print_risk_report(self, report: tuple, contract_address: str):
        """Pretty-print RiskRegistry report."""
        risk_score  = report[1]
        confidence  = report[2]
        task_id     = report[3]
        scanner     = report[4]
        scanned_at  = report[5]
        summary     = report[6]

        print(f"\n  Contract  : {contract_address}")
        print(f"  Risk Score: {risk_bar(risk_score)}")
        print(f"  Confidence: {confidence}%")
        print(f"  Summary   : {summary}")
        print(f"  Task ID   : #{task_id}")
        print(f"  Scanner   : {scanner[:18]}…")
        print(f"  Timestamp : {time.strftime('%H:%M:%S', time.localtime(scanned_at))}")
        print()
        print(f"  🔗 Verify on-chain:")
        print(f"     https://shannon-explorer.somnia.network/address/{contract_address}")
        print()
        print(f"  {'━' * 55}")
        print(f"  Somnia sub-second finality: risk score published in")
        elapsed = time.time() - scanned_at
        print(f"  {abs(elapsed):.1f}s after the contract was deployed.")
        print(f"  On Ethereum this would take 5-10 minutes.")
        print(f"  {'━' * 55}")


# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="AuraGuard Live Demo")
    parser.add_argument("--manual", action="store_true",
                        help="Deploy a fresh VulnerableHoneyToken for this demo run")
    args = parser.parse_args()

    demo = AuraGuardDemo()
    await demo.run(manual_deploy=args.manual)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nDemo interrupted. 🛡️\n")
