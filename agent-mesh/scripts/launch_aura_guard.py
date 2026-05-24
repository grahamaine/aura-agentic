"""
launch_aura_guard.py — Start the entire AuraGuard agent swarm

Launches 5 agents simultaneously:
  1. Sentinel           — watches every Somnia block, fires on new contracts
  2. AuditOrchestrator  — coordinates 3-agent audits, writes to RiskRegistry
  3. SecurityAgent      — static vulnerability scanner
  4. SimulationAgent    — attack vector simulator
  5. SocialIntelAgent   — deployer & on-chain intelligence

All agents auto-register on-chain and begin working immediately.
No human intervention needed after this script runs.

Usage:
  python scripts/launch_aura_guard.py

Required .env:
  PRIVATE_KEY                — sentinel wallet (auto-registered)
  AUDIT_ORCHESTRATOR_KEY     — orchestrator wallet
  SECURITY_AGENT_KEY         — security scanner wallet
  SIMULATION_AGENT_KEY       — simulation agent wallet
  SOCIAL_INTEL_AGENT_KEY     — social intel wallet
  REGISTRY_ADDRESS           — deployed AgentRegistry
  MARKET_ADDRESS             — deployed TaskMarket
  RISK_REGISTRY_ADDRESS      — deployed RiskRegistry
  ANTHROPIC_API_KEY          — Claude API key
  SOMNIA_RPC_URL             (optional) — defaults to testnet
"""

import asyncio
import logging
import os
import sys

# Support running from project root OR from scripts/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(override=True)

from agents.base_agent import AgentConfig, Capability
from agents.audit_orchestrator import AuditOrchestrator
from agents.security_agent import SecurityAgent
from agents.simulation_agent import SimulationAgent
from agents.social_intel_agent import SocialIntelAgent

# ── Logging setup ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-28s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("launch")

# ── Config helpers ─────────────────────────────────────────────────────────────

RPC_URL          = os.environ.get("SOMNIA_RPC_URL", "https://api.infra.testnet.somnia.network/")
REGISTRY_ADDR    = os.environ["REGISTRY_ADDRESS"]
MARKET_ADDR      = os.environ["MARKET_ADDRESS"]
RISK_REG_ADDR    = os.environ.get("RISK_REGISTRY_ADDRESS", "")


def _require_key(env_var: str, agent_name: str) -> str:
    val = os.environ.get(env_var)
    if not val:
        log.error(f"Missing {env_var} for {agent_name} — set it in .env")
        sys.exit(1)
    return val


# ── Agent factory ──────────────────────────────────────────────────────────────

def make_audit_orchestrator() -> AuditOrchestrator:
    key = _require_key("AUDIT_ORCHESTRATOR_KEY", "AuditOrchestrator")
    config = AgentConfig(
        name="AuraGuard-Orchestrator",
        capabilities=[Capability.Orchestration, Capability.Analysis],
        private_key=key,
        rpc_url=RPC_URL,
        registry_address=REGISTRY_ADDR,
        task_market_address=MARKET_ADDR,
        poll_interval=1.5,
    )
    agent = AuditOrchestrator(config, risk_registry_address=RISK_REG_ADDR)
    agent.setup_contracts(REGISTRY_ADDR, MARKET_ADDR)
    return agent


def make_security_agent() -> SecurityAgent:
    key = _require_key("SECURITY_AGENT_KEY", "SecurityAgent")
    config = AgentConfig(
        name="AuraGuard-Security",
        capabilities=[Capability.Analysis],
        private_key=key,
        rpc_url=RPC_URL,
        registry_address=REGISTRY_ADDR,
        task_market_address=MARKET_ADDR,
        poll_interval=1.5,
    )
    agent = SecurityAgent(config)
    agent.setup_contracts(REGISTRY_ADDR, MARKET_ADDR)
    return agent


def make_simulation_agent() -> SimulationAgent:
    key = _require_key("SIMULATION_AGENT_KEY", "SimulationAgent")
    config = AgentConfig(
        name="AuraGuard-Simulation",
        capabilities=[Capability.CodeGen],
        private_key=key,
        rpc_url=RPC_URL,
        registry_address=REGISTRY_ADDR,
        task_market_address=MARKET_ADDR,
        poll_interval=1.5,
    )
    agent = SimulationAgent(config)
    agent.setup_contracts(REGISTRY_ADDR, MARKET_ADDR)
    return agent


def make_social_intel_agent() -> SocialIntelAgent:
    key = _require_key("SOCIAL_INTEL_AGENT_KEY", "SocialIntelAgent")
    config = AgentConfig(
        name="AuraGuard-SocialIntel",
        capabilities=[Capability.Research, Capability.DataFetch],
        private_key=key,
        rpc_url=RPC_URL,
        registry_address=REGISTRY_ADDR,
        task_market_address=MARKET_ADDR,
        poll_interval=1.5,
    )
    agent = SocialIntelAgent(config)
    agent.setup_contracts(REGISTRY_ADDR, MARKET_ADDR)
    return agent


# ── Main ───────────────────────────────────────────────────────────────────────

async def launch_all():
    print("\n" + "═" * 65)
    print("  🛡️  AuraGuard — Autonomous DeFi Security Swarm")
    print("  Built on AuraAgentic × Somnia — Sub-second threat detection")
    print("═" * 65)
    print(f"  RPC        : {RPC_URL}")
    print(f"  Registry   : {REGISTRY_ADDR[:20]}…")
    print(f"  Market     : {MARKET_ADDR[:20]}…")
    print(f"  RiskReg    : {RISK_REG_ADDR[:20] + '…' if RISK_REG_ADDR else 'NOT SET'}")
    print("═" * 65)

    # Build all agents
    agents = [
        ("🎯 AuditOrchestrator", make_audit_orchestrator),
        ("🔬 SecurityAgent",     make_security_agent),
        ("⚡ SimulationAgent",   make_simulation_agent),
        ("🕵️  SocialIntelAgent", make_social_intel_agent),
    ]

    running_agents = []
    for name, factory in agents:
        try:
            agent = factory()
            running_agents.append((name, agent))
            print(f"  ✅ {name:<30} {agent.address[:20]}…")
        except SystemExit:
            raise
        except Exception as e:
            print(f"  ❌ {name:<30} FAILED: {e}")

    print("\n" + "═" * 65)
    print(f"  {len(running_agents)} agents starting... Ctrl+C to stop")
    print("═" * 65 + "\n")

    if not running_agents:
        log.error("No agents could be initialized. Check your .env file.")
        return

    # Launch all agent loops concurrently
    tasks = [
        asyncio.create_task(agent.run(), name=name)
        for name, agent in running_agents
    ]

    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        log.info("Shutdown signal received — stopping all agents...")
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        log.info("All agents stopped cleanly.")
    except KeyboardInterrupt:
        log.info("Keyboard interrupt — shutting down...")
        for t in tasks:
            t.cancel()


def main():
    try:
        asyncio.run(launch_all())
    except KeyboardInterrupt:
        print("\n\nAuraGuard stopped by user. Stay safe out there. 🛡️\n")


if __name__ == "__main__":
    main()
