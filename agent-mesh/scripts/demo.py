"""
AuraAgentic Full Demo
=====================
Demonstrates the complete autonomous multi-agent task pipeline on Somnia.

What happens:
1. Five agents (Orchestrator, Research, Code, Analysis, Verifier) register on-chain
2. User posts a complex task with STT reward
3. Orchestrator picks it up, decomposes it into sub-tasks, posts them on-chain
4. Specialist agents bid, get assigned, execute with Claude AI
5. Verifier scores results and releases payment — all on-chain
6. Final synthesized answer is printed

Run:
    python scripts/demo.py

Requires:
    - .env with ANTHROPIC_API_KEY, PRIVATE_KEY, and contract addresses
    - pip install -r requirements.txt
"""

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich import print as rprint

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents import (
    OrchestratorAgent,
    ResearchAgent,
    CodeAgent,
    AnalysisAgent,
    VerifierAgent,
)
from agents.base_agent import AgentConfig, Capability

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

console = Console()

# ── Load deployed addresses ──────────────────────────────────────────────────

def load_addresses() -> dict:
    path = Path(__file__).parent.parent / "artifacts" / "deployed.json"
    if path.exists():
        return json.loads(path.read_text())["contracts"]
    # Fallback to env
    return {
        "AgentRegistry": os.environ.get("AGENT_REGISTRY_ADDRESS", ""),
        "AgentVault":    os.environ.get("AGENT_VAULT_ADDRESS", ""),
        "TaskMarket":    os.environ.get("TASK_MARKET_ADDRESS", ""),
    }


def make_config(name: str, caps: list[Capability], key_env: str) -> AgentConfig:
    return AgentConfig(
        name=name,
        capabilities=caps,
        private_key=os.environ.get(key_env, os.environ["PRIVATE_KEY"]),
        rpc_url=os.environ.get("SOMNIA_RPC_URL", "https://dream-rpc.somnia.network"),
    )


async def register_agent(agent, addrs: dict):
    agent.setup_contracts(addrs["AgentRegistry"], addrs["TaskMarket"])
    try:
        await agent.register_on_chain()
        console.print(f"  [green]✓[/green] {agent.config.name} registered ({agent.address[:10]}...)")
    except Exception as e:
        if "Already registered" in str(e):
            console.print(f"  [yellow]~[/yellow] {agent.config.name} already registered")
        else:
            console.print(f"  [red]✗[/red] {agent.config.name} registration failed: {e}")


async def post_demo_task(orchestrator: OrchestratorAgent) -> int:
    """Post the flagship demo task to TaskMarket."""
    from web3 import Web3
    reward_wei = Web3.to_wei(0.005, "ether")  # 0.005 STT
    deadline = int(time.time()) + 600          # 10 minutes

    fn = orchestrator._market.functions.postTask(
        "Autonomous DeFi Research & Strategy Report",
        (
            "Research the current state of DeFi on Somnia network. "
            "Analyse TVL trends, top protocols, and yield opportunities. "
            "Then generate a Python script that fetches live DeFi data from "
            "a public API. Finally, produce an executive report with "
            "investment recommendations for a DeFi fund manager."
        ),
        json.dumps({
            "chain": "Somnia",
            "focus": ["TVL", "yield", "protocols"],
            "output_format": "executive_report + python_script",
        }),
        int(Capability.Orchestration),  # Orchestrator picks this up
        deadline,
        2,  # Priority.High
    )
    tx = await orchestrator._send_tx(fn, value_wei=reward_wei)
    task_id = await orchestrator._market.functions.taskCount().call()
    return task_id, tx


async def run_demo():
    console.rule("[bold blue]AuraAgentic — Autonomous Multi-Agent Demo on Somnia[/bold blue]")
    console.print()

    addrs = load_addresses()
    if not all(addrs.values()):
        console.print("[red]ERROR: Contract addresses not found.[/red]")
        console.print("Run: npx hardhat run scripts/deploy.js --network somnia_testnet")
        return

    console.print(Panel.fit(
        f"[bold]Registry:[/bold] {addrs['AgentRegistry']}\n"
        f"[bold]Market:  [/bold] {addrs['TaskMarket']}\n"
        f"[bold]Vault:   [/bold] {addrs['AgentVault']}",
        title="Contract Addresses",
    ))

    # ── Create agents ────────────────────────────────────────────────────────
    orchestrator = OrchestratorAgent(make_config(
        "Orchestrator-1", [Capability.Orchestration], "ORCHESTRATOR_KEY"
    ))
    researcher = ResearchAgent(make_config(
        "Researcher-1", [Capability.Research, Capability.DataFetch], "RESEARCH_AGENT_KEY"
    ))
    coder = CodeAgent(make_config(
        "Coder-1", [Capability.CodeGen], "CODE_AGENT_KEY"
    ))
    analyst = AnalysisAgent(make_config(
        "Analyst-1", [Capability.Analysis], "ANALYSIS_AGENT_KEY"
    ))
    verifier = VerifierAgent(make_config(
        "Verifier-1", [Capability.Verification], "VERIFIER_AGENT_KEY"
    ))

    all_agents = [orchestrator, researcher, coder, analyst, verifier]
    for ag in all_agents:
        ag.setup_contracts(addrs["AgentRegistry"], addrs["TaskMarket"])

    # ── Register agents ──────────────────────────────────────────────────────
    console.rule("Step 1: Agent Registration")
    for ag in all_agents:
        await register_agent(ag, addrs)

    # Set verifier in TaskMarket
    try:
        from web3 import Web3
        fn = orchestrator._market.functions.setVerifier(verifier.address)
        await orchestrator._send_tx(fn)
        console.print(f"  [green]✓[/green] VerifierAgent set in TaskMarket")
    except Exception as e:
        console.print(f"  [yellow]~[/yellow] setVerifier: {e}")

    # ── Post demo task ───────────────────────────────────────────────────────
    console.rule("Step 2: Post Complex Task")
    task_id, tx = await post_demo_task(orchestrator)
    console.print(f"  [green]✓[/green] Task #{task_id} posted")
    console.print(f"  [dim]TX: {tx}[/dim]")
    console.print(f"  [dim]Explorer: https://shannon-explorer.somnia.network/tx/{tx}[/dim]")

    # ── Start all agents concurrently ────────────────────────────────────────
    console.rule("Step 3: Autonomous Agent Execution")
    console.print("  All agents are now running autonomously on Somnia...\n")

    # Run agents with a 3-minute timeout for the demo
    tasks = [asyncio.create_task(ag.run()) for ag in all_agents]

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        prog = progress.add_task("Agents executing on-chain...", total=None)

        # Monitor until task completes or timeout
        start = time.time()
        while time.time() - start < 180:  # 3-minute demo window
            t = await orchestrator.get_task(task_id)
            status_names = ["Open","Assigned","InProgress","PendingVerification",
                           "Completed","Disputed","Cancelled"]
            status_str = status_names[t["status"]]
            progress.update(prog, description=f"Task #{task_id} status: [bold]{status_str}[/bold]")

            if t["status"] in (4, 5, 6):  # Completed, Disputed, Cancelled
                break
            await asyncio.sleep(5)

    # Cancel all agent loops
    for task in tasks:
        task.cancel()

    # ── Final results ────────────────────────────────────────────────────────
    console.rule("Step 4: Results")
    final_task = await orchestrator.get_task(task_id)

    table = Table(title=f"Task #{task_id} Final State")
    table.add_column("Field", style="cyan")
    table.add_column("Value", style="white")
    table.add_row("Title", final_task["title"])
    table.add_row("Status", status_names[final_task["status"]])
    table.add_row("Assigned Agent", final_task["assignedAgent"][:20] + "..." if final_task["assignedAgent"] != "0x" + "0"*40 else "None")
    table.add_row("Quality Score", str(final_task["qualityScore"]) + "/100")
    table.add_row("Reward", f"{final_task['reward'] / 1e18:.6f} STT")
    console.print(table)

    if final_task["resultHash"]:
        try:
            result_data = json.loads(final_task["resultHash"])
            console.print(Panel(
                result_data.get("result", final_task["resultHash"])[:2000],
                title="[bold green]Final Deliverable (excerpt)[/bold green]",
            ))
        except Exception:
            console.print(Panel(final_task["resultHash"][:2000], title="Result"))

    # ── Agent stats ──────────────────────────────────────────────────────────
    console.rule("Agent Statistics")
    stats_table = Table()
    stats_table.add_column("Agent")
    stats_table.add_column("Tasks Bid")
    stats_table.add_column("Tasks Completed")
    for ag in all_agents:
        stats_table.add_row(
            ag.config.name,
            str(ag.stats["tasks_bid"]),
            str(ag.stats["tasks_completed"]),
        )
    console.print(stats_table)

    console.rule("[bold green]AuraAgentic Demo Complete[/bold green]")


if __name__ == "__main__":
    asyncio.run(run_demo())
