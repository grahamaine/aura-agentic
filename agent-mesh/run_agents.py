"""
run_agents.py — Launch all AuraAgentic agents in parallel on Somnia.

Usage:
    python run_agents.py                # start all 5 agents
    python run_agents.py --dry-run      # validate config without connecting
    python run_agents.py --agent orch   # start only the orchestrator
"""

import asyncio
import logging
import os
import sys
import argparse
from typing import Type

from dotenv import load_dotenv

load_dotenv(override=True)

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("launcher")

# ── Import agents ──────────────────────────────────────────────────────────────
try:
    from agents.base_agent import AgentConfig, Capability
    from agents.orchestrator import OrchestratorAgent
    from agents.research_agent import ResearchAgent
    from agents.code_agent import CodeAgent
    from agents.analysis_agent import AnalysisAgent
    from agents.verifier import VerifierAgent
except ImportError as e:
    print(f"[error] Could not import agents: {e}")
    print("        Run from the agent-mesh/ directory: python run_agents.py")
    sys.exit(1)

# ── Config helpers ─────────────────────────────────────────────────────────────
SOMNIA_RPC      = os.environ.get("SOMNIA_RPC",            "https://api.infra.testnet.somnia.network")
REGISTRY_ADDR   = os.environ.get("AGENT_REGISTRY_ADDRESS", os.environ.get("REGISTRY_ADDRESS", ""))
MARKET_ADDR     = os.environ.get("TASK_MARKET_ADDRESS",   "")
ANTHROPIC_KEY   = os.environ.get("ANTHROPIC_API_KEY",     "")

AGENT_ROSTER = [
    {
        "id":    "orch",
        "cls":   OrchestratorAgent,
        "name":  "Orchestrator-1",
        "caps":  [Capability.Orchestration],
        "key":   "ORCHESTRATOR_KEY",
    },
    {
        "id":    "research",
        "cls":   ResearchAgent,
        "name":  "Researcher-1",
        "caps":  [Capability.Research, Capability.DataFetch],
        "key":   "RESEARCH_AGENT_KEY",
    },
    {
        "id":    "code",
        "cls":   CodeAgent,
        "name":  "Coder-1",
        "caps":  [Capability.CodeGen],
        "key":   "CODE_AGENT_KEY",
    },
    {
        "id":    "analysis",
        "cls":   AnalysisAgent,
        "name":  "Analyst-1",
        "caps":  [Capability.Analysis],
        "key":   "ANALYSIS_AGENT_KEY",
    },
    {
        "id":    "verifier",
        "cls":   VerifierAgent,
        "name":  "Verifier-1",
        "caps":  [Capability.Verification],
        "key":   "VERIFIER_AGENT_KEY",
    },
]


def check_env(dry_run: bool) -> bool:
    ok = True
    missing = []
    for entry in AGENT_ROSTER:
        if not os.environ.get(entry["key"]):
            missing.append(entry["key"])
    if not ANTHROPIC_KEY:
        missing.append("ANTHROPIC_API_KEY")
    if not REGISTRY_ADDR and not dry_run:
        missing.append("REGISTRY_ADDRESS")
    if not MARKET_ADDR and not dry_run:
        missing.append("TASK_MARKET_ADDRESS")

    if missing:
        log.error("Missing env vars: %s", ", ".join(missing))
        log.error("Copy .env.example to .env and fill in your values.")
        ok = False

    return ok


async def run_agent_with_restart(
    cls: Type,
    config: AgentConfig,
    registry_addr: str,
    market_addr: str,
    max_restarts: int = 5,
):
    """Run an agent; auto-restart on crash up to max_restarts times."""
    restarts = 0
    while restarts <= max_restarts:
        agent = cls(config)
        agent.setup_contracts(registry_addr, market_addr)
        try:
            log.info("[%s] Starting (restart #%d)", config.name, restarts)
            await agent.run()
            # clean exit — don't restart
            break
        except asyncio.CancelledError:
            log.info("[%s] Stopped.", config.name)
            break
        except Exception as exc:
            restarts += 1
            if restarts > max_restarts:
                log.error("[%s] Crashed %d times — giving up. Last error: %s", config.name, restarts, exc)
                break
            delay = min(5 * restarts, 30)
            log.warning("[%s] Crashed: %s. Restarting in %ds…", config.name, exc, delay)
            await asyncio.sleep(delay)


async def main(agent_filter: list[str], dry_run: bool):
    if not check_env(dry_run):
        sys.exit(1)

    roster = [e for e in AGENT_ROSTER if not agent_filter or e["id"] in agent_filter]
    if not roster:
        log.error("No matching agents for filter: %s", agent_filter)
        sys.exit(1)

    log.info("=== AuraAgentic Agent Launcher ===")
    log.info("RPC:      %s", SOMNIA_RPC)
    log.info("Registry: %s", REGISTRY_ADDR or "(dry-run)")
    log.info("Market:   %s", MARKET_ADDR   or "(dry-run)")
    log.info("Starting %d agent(s): %s", len(roster), ", ".join(e["name"] for e in roster))

    if dry_run:
        log.info("Dry-run mode — config OK, no connections made.")
        return

    tasks = []
    for entry in roster:
        config = AgentConfig(
            name=entry["name"],
            capabilities=entry["caps"],
            private_key=os.environ[entry["key"]],
            rpc_url=SOMNIA_RPC,
            registry_address=REGISTRY_ADDR,
            task_market_address=MARKET_ADDR,
        )
        tasks.append(
            asyncio.create_task(
                run_agent_with_restart(entry["cls"], config, REGISTRY_ADDR, MARKET_ADDR),
                name=entry["name"],
            )
        )

    log.info("All agents running. Press Ctrl+C to stop.")
    try:
        await asyncio.gather(*tasks)
    except KeyboardInterrupt:
        log.info("Shutting down…")
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        log.info("All agents stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Launch AuraAgentic agents on Somnia")
    parser.add_argument("--dry-run", action="store_true", help="Validate config only")
    parser.add_argument("--agent", nargs="+", metavar="ID",
                        help="Run specific agents (orch, research, code, analysis, verifier)")
    args = parser.parse_args()

    asyncio.run(main(agent_filter=args.agent or [], dry_run=args.dry_run))
