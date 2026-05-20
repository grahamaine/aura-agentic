"""
post_task.py — Post a task to AuraAgentic and watch the full end-to-end flow live.

The script:
  1. Posts a task with an STT reward to TaskMarket
  2. Waits for agents to bid (polls chain every 2s)
  3. Auto-assigns the highest-reputation bidder
  4. Waits for the agent to submit a result
  5. Waits for Verifier to score and release payment
  6. Prints the final result

Usage:
    # Use a preset sample task
    python scripts/post_task.py

    # Custom task
    python scripts/post_task.py --cap 1 --reward 0.005 --title "Write a Python quicksort" --desc "Implement quicksort with tests"

    # Pick a specific preset
    python scripts/post_task.py --preset 2
"""

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone

# Ensure UTF-8 output on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from web3 import AsyncWeb3

load_dotenv(override=True)

# ── Config ─────────────────────────────────────────────────────────────────────
MARKET_ADDR   = os.environ.get("TASK_MARKET_ADDRESS",   "")
REGISTRY_ADDR = os.environ.get("AGENT_REGISTRY_ADDRESS", "")
PRIVATE_KEY   = os.environ.get("PRIVATE_KEY",            "")
SOMNIA_RPC    = os.environ.get("SOMNIA_RPC_URL", "https://api.infra.testnet.somnia.network/")
EXPLORER      = "https://shannon-explorer.somnia.network"

if not MARKET_ADDR or not PRIVATE_KEY:
    print("[error] TASK_MARKET_ADDRESS and PRIVATE_KEY must be set in .env")
    sys.exit(1)

PRIVATE_KEY = PRIVATE_KEY.replace("0x", "").replace("\r", "").strip()
PRIVATE_KEY = "".join(c for c in PRIVATE_KEY if c in "0123456789abcdefABCDEF")

CAP_LABELS = ["Research", "Code Gen", "Analysis", "Verification", "Orchestration", "Data Fetch"]
STATUS_LABELS = ["Open", "Assigned", "In Progress", "Pending Verification", "Completed", "Disputed", "Cancelled"]

# ── Preset tasks ───────────────────────────────────────────────────────────────
PRESETS = [
    {
        "title":       "Research top DeFi protocols on Somnia blockchain",
        "description": "Find and summarise the top 5 DeFi protocols deployed or planned for Somnia. Include TVL estimates, token names, and key features.",
        "input":       json.dumps({"query": "Somnia DeFi ecosystem protocols", "depth": "comprehensive"}),
        "cap":         0,   # Research
        "reward":      0.004,
    },
    {
        "title":       "Write a gas-optimised ERC-20 token contract",
        "description": "Write a production-ready ERC-20 contract in Solidity 0.8.24 with mint, burn, and permit functions. Optimise for gas efficiency.",
        "input":       json.dumps({"language": "Solidity", "version": "0.8.24", "features": ["mint","burn","permit","ownable"]}),
        "cap":         1,   # Code Gen
        "reward":      0.006,
    },
    {
        "title":       "Analyse Somnia validator performance data",
        "description": "Analyse the current Somnia testnet validator set. Identify performance patterns, uptime stats, and any anomalies.",
        "input":       json.dumps({"network": "Somnia testnet", "metrics": ["uptime","latency","block_production"]}),
        "cap":         2,   # Analysis
        "reward":      0.005,
    },
    {
        "title":       "Build a TypeScript SDK snippet for posting tasks to AgentMesh",
        "description": "Write a TypeScript helper that wraps the TaskMarket contract's postTask() function with type safety and error handling.",
        "input":       json.dumps({"contract": "TaskMarket", "language": "TypeScript", "library": "ethers.js v6"}),
        "cap":         1,   # Code Gen
        "reward":      0.005,
    },
    {
        "title":       "Summarise the top 10 Somnia ecosystem projects",
        "description": "Compile a structured summary of 10 notable projects building on Somnia — include category, status, and links.",
        "input":       json.dumps({"source": "public information", "format": "markdown table"}),
        "cap":         0,   # Research
        "reward":      0.003,
    },
]

# ── ABI (full lifecycle) ────────────────────────────────────────────────────────
MARKET_ABI = [
    {"inputs":[{"internalType":"string","name":"title","type":"string"},
               {"internalType":"string","name":"description","type":"string"},
               {"internalType":"string","name":"inputData","type":"string"},
               {"internalType":"uint8","name":"requiredCapability","type":"uint8"},
               {"internalType":"uint256","name":"deadline","type":"uint256"},
               {"internalType":"uint8","name":"priority","type":"uint8"}],
     "name":"postTask","outputs":[{"internalType":"uint256","name":"taskId","type":"uint256"}],
     "stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"taskId","type":"uint256"},
               {"internalType":"address","name":"agent","type":"address"}],
     "name":"assignTask","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"taskId","type":"uint256"}],
     "name":"getTask","outputs":[{"components":[
       {"internalType":"uint256","name":"id","type":"uint256"},
       {"internalType":"address","name":"poster","type":"address"},
       {"internalType":"string","name":"title","type":"string"},
       {"internalType":"string","name":"description","type":"string"},
       {"internalType":"string","name":"inputData","type":"string"},
       {"internalType":"uint8","name":"requiredCapability","type":"uint8"},
       {"internalType":"uint256","name":"reward","type":"uint256"},
       {"internalType":"uint256","name":"deadline","type":"uint256"},
       {"internalType":"uint8","name":"status","type":"uint8"},
       {"internalType":"address","name":"assignedAgent","type":"address"},
       {"internalType":"address[]","name":"bidders","type":"address[]"},
       {"internalType":"string","name":"resultHash","type":"string"},
       {"internalType":"uint256","name":"qualityScore","type":"uint256"},
       {"internalType":"uint8","name":"priority","type":"uint8"},
       {"internalType":"uint256","name":"createdAt","type":"uint256"}],
       "internalType":"struct ITaskMarket.Task","name":"","type":"tuple"}],
     "stateMutability":"view","type":"function"},
    {"inputs":[],"name":"taskCount",
     "outputs":[{"internalType":"uint256","name":"","type":"uint256"}],
     "stateMutability":"view","type":"function"},
    {"anonymous":False,"inputs":[
       {"indexed":True,"internalType":"uint256","name":"taskId","type":"uint256"},
       {"indexed":True,"internalType":"address","name":"poster","type":"address"},
       {"indexed":False,"internalType":"uint256","name":"reward","type":"uint256"}],
     "name":"TaskPosted","type":"event"},
    {"anonymous":False,"inputs":[
       {"indexed":True,"internalType":"uint256","name":"taskId","type":"uint256"},
       {"indexed":True,"internalType":"address","name":"agent","type":"address"}],
     "name":"TaskAssigned","type":"event"},
    {"anonymous":False,"inputs":[
       {"indexed":True,"internalType":"uint256","name":"taskId","type":"uint256"},
       {"indexed":True,"internalType":"address","name":"agent","type":"address"},
       {"indexed":False,"internalType":"uint256","name":"qualityScore","type":"uint256"}],
     "name":"TaskCompleted","type":"event"},
    {"anonymous":False,"inputs":[
       {"indexed":True,"internalType":"uint256","name":"taskId","type":"uint256"},
       {"indexed":True,"internalType":"address","name":"verifier","type":"address"}],
     "name":"TaskDisputed","type":"event"},
    {"anonymous":False,"inputs":[
       {"indexed":True,"internalType":"uint256","name":"taskId","type":"uint256"},
       {"indexed":True,"internalType":"address","name":"agent","type":"address"}],
     "name":"BidSubmitted","type":"event"},
]

REGISTRY_ABI = [
    {"inputs":[{"internalType":"address","name":"wallet","type":"address"}],
     "name":"getAgent","outputs":[{"components":[
       {"internalType":"address","name":"wallet","type":"address"},
       {"internalType":"string","name":"name","type":"string"},
       {"internalType":"string","name":"endpoint","type":"string"},
       {"internalType":"uint8[]","name":"capabilities","type":"uint8[]"},
       {"internalType":"uint256","name":"stake","type":"uint256"},
       {"internalType":"uint256","name":"completedTasks","type":"uint256"},
       {"internalType":"uint256","name":"reputation","type":"uint256"},
       {"internalType":"uint8","name":"status","type":"uint8"},
       {"internalType":"uint256","name":"registeredAt","type":"uint256"}],
       "internalType":"struct IAgentRegistry.AgentProfile","name":"","type":"tuple"}],
     "stateMutability":"view","type":"function"},
]

# ── Helpers ─────────────────────────────────────────────────────────────────────
def ts():
    return datetime.now().strftime("%H:%M:%S")

def log(symbol, msg, color=""):
    colors = {"green": "\033[92m", "yellow": "\033[93m", "red": "\033[91m",
              "cyan": "\033[96m", "bold": "\033[1m", "dim": "\033[2m", "": ""}
    reset = "\033[0m"
    print(f"{colors.get(color,'')}{ts()} {symbol}  {msg}{reset}")

def tx_link(tx_hash):
    return f"{EXPLORER}/tx/{tx_hash}"

def addr_link(addr):
    return f"{EXPLORER}/address/{addr}"

def task_raw_to_dict(raw):
    keys = ["id","poster","title","description","inputData","requiredCapability",
            "reward","deadline","status","assignedAgent","bidders",
            "resultHash","qualityScore","priority","createdAt"]
    return dict(zip(keys, raw))

# ── Main ────────────────────────────────────────────────────────────────────────
async def main(task_def: dict):
    w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(SOMNIA_RPC))
    account = w3.eth.account.from_key(PRIVATE_KEY)
    market   = w3.eth.contract(address=AsyncWeb3.to_checksum_address(MARKET_ADDR),   abi=MARKET_ABI)
    registry = w3.eth.contract(address=AsyncWeb3.to_checksum_address(REGISTRY_ADDR), abi=REGISTRY_ABI)

    balance = await w3.eth.get_balance(account.address)
    reward_wei = int(task_def["reward"] * 1e18)

    print()
    print("\033[1m" + "═" * 60 + "\033[0m")
    print("\033[1m  AuraAgentic — End-to-End Task Flow Test\033[0m")
    print("\033[1m" + "═" * 60 + "\033[0m")
    print(f"  Poster:   {account.address}")
    print(f"  Balance:  {balance / 1e18:.4f} STT")
    print(f"  Market:   {MARKET_ADDR}")
    print(f"  Task:     {task_def['title']}")
    print(f"  Cap:      {CAP_LABELS[task_def['cap']]}")
    print(f"  Reward:   {task_def['reward']} STT")
    print("\033[1m" + "═" * 60 + "\033[0m")
    print()

    if balance < reward_wei:
        log("✗", f"Insufficient balance. Need {task_def['reward']} STT.", "red")
        return

    # ── Step 1: Post task ──────────────────────────────────────────────────────
    log("📋", "Posting task to TaskMarket...", "cyan")
    deadline = int(time.time()) + 3600  # 1 hour from now

    nonce     = await w3.eth.get_transaction_count(account.address)
    gas_price = await w3.eth.gas_price
    fn        = market.functions.postTask(
        task_def["title"],
        task_def["description"],
        task_def["input"],
        task_def["cap"],
        deadline,
        1,  # Medium priority
    )
    tx_dict  = await fn.build_transaction({
        "from": account.address, "nonce": nonce,
        "gasPrice": gas_price, "value": reward_wei,
    })
    signed   = account.sign_transaction(tx_dict)
    tx_hash  = await w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt  = await w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

    # Parse taskId from receipt logs
    task_id = None
    try:
        parsed = market.events.TaskPosted().process_receipt(receipt)
        task_id = parsed[0]["args"]["taskId"]
    except Exception:
        task_id = await market.functions.taskCount().call()

    log("✅", f"Task #{task_id} posted! Reward: {task_def['reward']} STT escrowed", "green")
    log("🔗", f"Tx: {tx_link(receipt['transactionHash'].hex())}", "dim")
    print()

    # ── Step 2: Wait for bids ──────────────────────────────────────────────────
    log("⏳", "Waiting for agents to bid... (agents must be running: python run_agents.py)", "yellow")
    start = time.time()
    timeout_bid = 300  # 5 min

    while time.time() - start < timeout_bid:
        task = task_raw_to_dict(await market.functions.getTask(task_id).call())
        bidders = task["bidders"]

        if bidders:
            log("🙋", f"{len(bidders)} bid(s) received!", "green")
            for b in bidders:
                try:
                    profile = await registry.functions.getAgent(b).call()
                    log("   ", f"{profile[1]} ({b[:10]}...) — rep: {profile[6]}", "")
                except Exception:
                    log("   ", b, "")
            break

        elapsed = int(time.time() - start)
        print(f"\r  {ts()}  Polling... {elapsed}s elapsed ({len(bidders)} bids)", end="", flush=True)
        await asyncio.sleep(2)
    else:
        print()
        log("✗", "No bids received within 5 minutes. Is run_agents.py running?", "red")
        return
    print()

    # ── Step 3: Assign best bidder ─────────────────────────────────────────────
    task = task_raw_to_dict(await market.functions.getTask(task_id).call())
    bidders = task["bidders"]

    # Pick highest-reputation bidder
    best, best_rep = bidders[0], 0
    for b in bidders:
        try:
            profile = await registry.functions.getAgent(b).call()
            rep = profile[6]
            if rep > best_rep:
                best, best_rep = b, rep
        except Exception:
            pass

    log("🎯", f"Assigning to best bidder: {best[:10]}... (rep: {best_rep})", "cyan")
    nonce     = await w3.eth.get_transaction_count(account.address)
    gas_price = await w3.eth.gas_price
    fn2       = market.functions.assignTask(task_id, best)
    tx2       = await fn2.build_transaction({
        "from": account.address, "nonce": nonce, "gasPrice": gas_price,
    })
    signed2   = account.sign_transaction(tx2)
    tx_hash2  = await w3.eth.send_raw_transaction(signed2.raw_transaction)
    receipt2  = await w3.eth.wait_for_transaction_receipt(tx_hash2, timeout=60)
    log("✅", f"Task #{task_id} assigned on-chain", "green")
    log("🔗", f"Tx: {tx_link(receipt2['transactionHash'].hex())}", "dim")
    print()

    # ── Step 4: Wait for result submission ─────────────────────────────────────
    log("⏳", "Waiting for agent to execute task and submit result...", "yellow")
    start = time.time()
    timeout_result = 600  # 10 min (Claude inference takes a moment)

    while time.time() - start < timeout_result:
        task = task_raw_to_dict(await market.functions.getTask(task_id).call())
        status = task["status"]

        if status >= 3:  # PendingVerification or beyond
            log("📄", "Result submitted! Status: Pending Verification", "green")
            break

        elapsed = int(time.time() - start)
        status_label = STATUS_LABELS[status] if status < len(STATUS_LABELS) else str(status)
        print(f"\r  {ts()}  Status: {status_label} — {elapsed}s elapsed", end="", flush=True)
        await asyncio.sleep(3)
    else:
        print()
        log("✗", "Result not submitted within 10 minutes.", "red")
        return
    print()

    # ── Step 5: Wait for verification + payment ────────────────────────────────
    log("⏳", "Waiting for Verifier agent to score and release payment...", "yellow")
    start = time.time()
    timeout_verify = 300  # 5 min

    while time.time() - start < timeout_verify:
        task = task_raw_to_dict(await market.functions.getTask(task_id).call())
        status = task["status"]

        if status == 4:  # Completed
            score = task["qualityScore"]
            result_raw = task["resultHash"]
            try:
                result_data = json.loads(result_raw)
                result_text = result_data.get("result", result_raw)[:500]
            except Exception:
                result_text = result_raw[:500]

            print()
            print("\033[1m" + "═" * 60 + "\033[0m")
            print("\033[92m\033[1m  ✅ TASK COMPLETED SUCCESSFULLY\033[0m")
            print("\033[1m" + "═" * 60 + "\033[0m")
            print(f"  Task ID:    #{task_id}")
            print(f"  Agent:      {task['assignedAgent'][:10]}...")
            print(f"  Quality:    {score}/100")
            print(f"  Reward:     {task['reward'] / 1e18:.4f} STT released")
            print(f"  Split:      85% agent · 10% verifier · 5% protocol")
            print()
            print("  Result preview:")
            print("  " + "-" * 56)
            for line in result_text.split("\n")[:12]:
                print(f"  {line}")
            print("  " + "-" * 56)
            print()
            log("🔗", f"Task explorer: {addr_link(MARKET_ADDR)}", "dim")
            print()
            return

        if status == 5:  # Disputed
            print()
            log("⚠", f"Task #{task_id} disputed — quality score below 60.", "yellow")
            log("", f"Agent: {task['assignedAgent'][:10]}... | Score: {task['qualityScore']}/100", "")
            return

        elapsed = int(time.time() - start)
        print(f"\r  {ts()}  Waiting for verifier... {elapsed}s elapsed", end="", flush=True)
        await asyncio.sleep(3)
    else:
        print()
        log("✗", "Verification not completed within 5 minutes.", "red")
        task = task_raw_to_dict(await market.functions.getTask(task_id).call())
        log("", f"Final status: {STATUS_LABELS[task['status']]}", "")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Post a task and watch the full AuraAgentic pipeline")
    parser.add_argument("--preset",  type=int, default=1,   help="Preset task number 1-5 (default: 1)")
    parser.add_argument("--cap",     type=int, default=None, help="Override capability (0=Research 1=Code 2=Analysis)")
    parser.add_argument("--reward",  type=float, default=None, help="Override reward in STT (e.g. 0.005)")
    parser.add_argument("--title",   type=str, default=None, help="Override task title")
    parser.add_argument("--desc",    type=str, default=None, help="Override task description")
    args = parser.parse_args()

    # Pick preset (1-indexed)
    idx = max(0, min(args.preset - 1, len(PRESETS) - 1))
    task_def = dict(PRESETS[idx])

    # Apply overrides
    if args.cap     is not None: task_def["cap"]     = args.cap
    if args.reward  is not None: task_def["reward"]  = args.reward
    if args.title   is not None: task_def["title"]   = args.title
    if args.desc    is not None: task_def["description"] = args.desc

    print(f"\nUsing preset {idx + 1}: {task_def['title']}")
    print("Run with --preset 1-5 to pick a different task, or --help for options.\n")

    asyncio.run(main(task_def))
