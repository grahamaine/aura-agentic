# AuraAgentic — Autonomous Multi-Agent Task Economy on Somnia

> **Hackathon submission for the Somnia Agentic L1 Prize ($5,000)**

AuraAgentic is a fully on-chain multi-agent protocol where autonomous AI agents discover, bid for, execute, and verify complex tasks — paying each other in micro-transactions via Somnia's 1M-TPS chain. No human intermediaries. No off-chain coordination servers. Every agent interaction is a verifiable blockchain transaction.

**New: [AuraGuard](#aura-guard--autonomous-defi-security-swarm)** — A live swarm of security agents that scans every new smart contract deployed on Somnia in under 5 seconds and publishes a tamper-proof risk score on-chain before anyone loses money.

---

## Live Deployment

🌐 **Frontend:** [aura-agentic.vercel.app](https://aura-agentic.vercel.app)

### Core AgentMesh Contracts (Somnia Testnet)

| Contract | Address | Explorer |
|---|---|---|
| `AgentRegistry` | `0xe72b8E159291E152860A0313E125d3d3c96FeD4e` | [View ↗](https://shannon-explorer.somnia.network/address/0xe72b8E159291E152860A0313E125d3d3c96FeD4e) |
| `AgentVault` | `0x77E8b2ab44f5e676F8fB8FBF05FE1b4cbc2f8c60` | [View ↗](https://shannon-explorer.somnia.network/address/0x77E8b2ab44f5e676F8fB8FBF05FE1b4cbc2f8c60) |
| `TaskMarket` | `0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA` | [View ↗](https://shannon-explorer.somnia.network/address/0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA) |

### Live Agents

| Agent | Wallet | Capability |
|---|---|---|
| Orchestrator-1 | `0x7dE9de93C85e59bF32f88Bb9a69588f45EeE7F9D` | Orchestration |
| Researcher-1 | `0xb76C7e5b2C965DeD64d6FC004d4B21FFE66b034f` | Research / DataFetch |
| Coder-1 | `0x4687098345D4B6d405d8ffC863700A688F2B59e0` | CodeGen |
| Analyst-1 | `0xfd6b1aEC2013a758CF8c489f049ADC9314158E11` | Analysis |
| Verifier-1 | `0xC1fD7a69395FA3e7006968431f77EF0245aB009A` | Verification |

**Network:** Somnia Testnet · Chain ID `50312` · Token `STT`

---

## Architecture

```
User posts task + STT reward
         │
         ▼
  ┌─────────────────────────────────────────────────────────┐
  │                     TaskMarket.sol                       │
  │         postTask() → funds escrowed in AgentVault        │
  └──────────────────┬──────────────────────────────────────┘
                     │ TaskPosted event (sub-second on Somnia)
         ┌───────────┼───────────────────┐
         ▼           ▼                   ▼
  ┌────────────┐ ┌──────────┐   ┌──────────────┐
  │Orchestrator│ │Researcher│   │   Coder /    │
  │  (Claude)  │ │ (Claude) │   │  Analyst     │
  │  decomposes│ │ bids &   │   │  (Claude)    │
  │  → subtasks│ │ executes │   │  bids &      │
  └─────┬──────┘ └────┬─────┘   │  executes    │
        │              │         └──────┬───────┘
        │              │                │
        └──────────────┴────────────────┘
                        │ submitResult()
                        ▼
              ┌──────────────────┐
              │  VerifierAgent   │
              │  (Claude judge)  │
              │  scores 0-100    │
              └────────┬─────────┘
                       │ verifyAndPay()
                       ▼
         score ≥ 60 → payment released atomically
         score < 60 → task disputed, agent slashed

         Payment split: 85% executor · 10% verifier · 5% protocol
```

---

## Why This Is Uniquely Somnia-Native

| Feature | How AuraAgentic Uses It |
|---|---|
| **Reactive smart contracts** | Agents wake on `TaskPosted` events — pure event-driven, no polling |
| **1,000,000 TPS** | Agent micro-payments (0.001 STT) are economically viable at this throughput |
| **Sub-second finality** | Agents bid and get assigned within one second of a task being posted |
| **On-chain AI inference** | VerifierAgent embeds Claude quality scores directly into payment transactions |
| **EVM compatibility** | Full Solidity stack, Hardhat tooling, MetaMask integration |
| **Agent-native design** | Every agent interaction is a signed blockchain transaction — fully auditable |

---

## Smart Contracts

| Contract | Purpose |
|---|---|
| `AgentRegistry.sol` | Agent registration with STT staking, capability indexing, reputation scoring (0–1000) |
| `TaskMarket.sol` | Task posting, bidding, assignment, result submission, quality-gated payment release |
| `AgentVault.sol` | Escrow: holds STT until verification, then splits 85/10/5 atomically |

### Core on-chain flow

```
postTask()      → reward escrowed in AgentVault
submitBid()     → agent signals intent (capability verified)
assignTask()    → poster picks winner (reputation-weighted)
submitResult()  → executor submits result hash on-chain
verifyAndPay()  → Verifier calls with AI quality score
                  score ≥ 60 → 85% to executor, 10% to verifier, 5% to protocol
                  score < 60 → task disputed, executor reputation slashed
```

---

## Agent Types

| Agent | Capability | Role |
|---|---|---|
| `OrchestratorAgent` | Orchestration | Decomposes complex tasks, posts sub-tasks on-chain with reward slices |
| `ResearchAgent` | Research / DataFetch | Web research, fact-finding, structured report generation |
| `CodeAgent` | CodeGen | Code generation, algorithm design, production-quality output |
| `AnalysisAgent` | Analysis | Data analysis, pattern recognition, actionable insights |
| `VerifierAgent` | Verification | AI-powered quality scoring (Claude judge), triggers payment atomically |
| `SentinelAgent` | Orchestration | Watches every Somnia block in real-time, autonomously spawns tasks for detected events |

All agents share the same `BaseAgent` foundation: wallet management, Somnia RPC connection, Claude inference (`think_async`), retry logic with exponential backoff, and autonomous on-chain registration.

---

## AuraGuard — Autonomous DeFi Security Swarm

> **"A rug pull token just launched on Somnia. AuraGuard detected it in under 1 second. Three AI agents raced to audit it. The risk score was on-chain in 8 seconds. Users were warned before anyone lost money."**

AuraGuard is the first autonomous smart contract security network where AI agents have **real financial stakes** — bad assessments get slashed. It sits on top of AgentMesh and activates the moment any new contract is deployed on Somnia.

### Why Somnia Makes This Possible

On Ethereum (12-second blocks), a risk scan would complete *after* most users have already interacted with the contract. Somnia's sub-second finality means AuraGuard is faster than any attacker.

### AuraGuard Flow

```
New contract deployed on Somnia
       │
       │ < 1 second (Somnia sub-second finality)
       ▼
  [Sentinel] detects null 'to' field → gets receipt → fires audit task
       │
       │ 0.003 STT reward posted to TaskMarket
       ▼
  [AuditOrchestrator] picks up task, decomposes into 3 parallel sub-tasks:
       │
       ├──▶ [SecurityAgent]    Static scan: bytecode, function sigs,
       │                       reentrancy, unlimited mint, honeypot patterns
       │
       ├──▶ [SimulationAgent]  Attack sim: flash loan, price oracle,
       │                       reentrancy paths, direct rug vectors
       │
       └──▶ [SocialIntelAgent] Deployer profile: wallet age, tx history,
                               LP lock status, supply concentration
       │
       │ Results flow back on-chain via sub-task completion
       ▼
  [AuditOrchestrator] synthesizes FINAL_RISK_SCORE (0-100)
       │
       │ Writes permanently to RiskRegistry.sol on Somnia
       ▼
  [Dashboard] 💀 CRITICAL badge appears
  "Unlimited mint + LP drain + blacklist — DO NOT INTERACT"

  Total time: < 30 seconds. All on-chain. Zero human involvement.
```

### Risk Scale

| Score | Label | Meaning |
|---|---|---|
| 0 – 20 | ✅ SAFE | No significant vulnerabilities detected |
| 21 – 49 | 🟡 LOW RISK | Minor concerns, verify before large positions |
| 50 – 74 | 🟠 MEDIUM | Notable risks, proceed with extreme caution |
| 75 – 89 | 🔴 HIGH RISK | Serious vulnerabilities, avoid unless expert |
| 90 – 100 | 💀 CRITICAL | Certain exploit / rug, do not interact |

### AuraGuard Contracts

| Contract | Purpose |
|---|---|
| `RiskRegistry.sol` | On-chain risk score ledger. Stores score (0–100), confidence, summary, vulnerability flags, and the TaskMarket task ID that produced it — permanently queryable by anyone |
| `VulnerableHoneyToken.sol` | Demo rug-pull token used in live demonstrations. Contains 5 intentional exploits that AuraGuard detects: unlimited mint, configurable 99% sell tax, sell blacklist, LP drain backdoor, permanent owner control |

### AuraGuard Agents

| Agent | Capability | Role |
|---|---|---|
| `AuditOrchestrator` | Orchestration | Command brain. Decomposes audit into 3 parallel on-chain sub-tasks, synthesizes final risk score, writes to RiskRegistry |
| `SecurityAgent` | Analysis | Static vulnerability scanner. Decodes bytecode, identifies reentrancy, unlimited mint, honeypot patterns, dangerous function signatures |
| `SimulationAgent` | CodeGen | Attack simulator. Thinks like an attacker. Maps flash loan, price oracle manipulation, reentrancy, and direct rug paths |
| `SocialIntelAgent` | Research | Deployer profiler. Checks wallet age, transaction history, supply concentration, LP lock status |

### AuraGuard Sentinel Rules

The `SentinelAgent` now includes three new autonomous detection rules:

| Rule | Trigger | Cooldown |
|---|---|---|
| `new_contract_deployed` | Any transaction with null `to` field (contract creation) | 3s |
| `large_transfer_detected` | Unusually large token transfer (potential coordinated dump) | 20s |
| `rapid_deploy_pattern` | Same wallet deploys 3+ contracts in 20 blocks (scam factory) | 60s |

### Live AuraGuard Dashboard

Open `dashboard/index.html` in a browser and enter your deployed contract addresses.

Features:
- **Live scan feed** — every newly deployed contract appears as a colour-coded risk card within seconds
- **Arc risk gauge** — rolling average risk score across the last 10 contracts
- **Agent swarm panel** — real-time status of all 5 AuraGuard agents (idle / active / working)
- **Event stream** — every on-chain event (task posted, bid submitted, result verified) shown live
- **Contract lookup** — paste any address to instantly fetch its on-chain risk report

URL shortcut: `dashboard/index.html?rr=<RISK_REGISTRY>&mkt=<TASK_MARKET>`

---

## Quick Start

### Prerequisites

```bash
node >= 18
python >= 3.10
```

### 1. Clone & install

```bash
git clone https://github.com/grahamaine/aura-agentic.git
cd aura-agentic/agent-mesh

npm install
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PRIVATE_KEY=<your-64-hex-deployer-key>          # no 0x prefix
ANTHROPIC_API_KEY=<your-anthropic-api-key>       # from console.anthropic.com

# Core AgentMesh (already deployed — use these)
AGENT_REGISTRY_ADDRESS=0xe72b8E159291E152860A0313E125d3d3c96FeD4e
AGENT_VAULT_ADDRESS=0x77E8b2ab44f5e676F8fB8FBF05FE1b4cbc2f8c60
TASK_MARKET_ADDRESS=0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA

# Convenience aliases (used by agent scripts)
REGISTRY_ADDRESS=${AGENT_REGISTRY_ADDRESS}
MARKET_ADDRESS=${TASK_MARKET_ADDRESS}

# AgentMesh agent wallets (5 wallets)
ORCHESTRATOR_KEY=<hex>
RESEARCH_AGENT_KEY=<hex>
CODE_AGENT_KEY=<hex>
ANALYSIS_AGENT_KEY=<hex>
VERIFIER_AGENT_KEY=<hex>

# AuraGuard agent wallets (4 wallets, each needs 0.01+ STT)
AUDIT_ORCHESTRATOR_KEY=<hex>
SECURITY_AGENT_KEY=<hex>
SIMULATION_AGENT_KEY=<hex>
SOCIAL_INTEL_AGENT_KEY=<hex>

# AuraGuard contracts (set after running deploy_aura_guard.js)
RISK_REGISTRY_ADDRESS=
HONEY_TOKEN_ADDRESS=
```

Get free STT from the [Somnia Faucet](https://testnet.somnia.network/).

### 3. Deploy contracts

The core AgentMesh contracts are already deployed on Somnia Testnet. To deploy AuraGuard:

```bash
# Deploy RiskRegistry + VulnerableHoneyToken (demo)
npx hardhat run scripts/deploy_aura_guard.js --network somnia_testnet

# To redeploy core contracts from scratch
npx hardhat run scripts/deploy.js --network somnia_testnet
```

### 4. Fund agent wallets

```bash
npx hardhat run scripts/fund_agents.js --network somnia_testnet
```

### 5. Run AgentMesh

```bash
# Start all 5 core agents (auto-registers on-chain if new)
python run_agents.py

# Specific agents only
python run_agents.py --agent orch verifier
```

### 6. Run AuraGuard Security Swarm

```bash
# Launch all 5 AuraGuard agents simultaneously
python scripts/launch_aura_guard.py
```

### 7. Run the AuraGuard live demo

In a second terminal (agents must be running):

```bash
python scripts/demo_aura_guard.py
```

This deploys a `VulnerableHoneyToken`, posts a scan task to TaskMarket, and streams agent activity live as the swarm detects and reports the exploits.

### 8. Post a custom AgentMesh task

```bash
# Use a preset task
python scripts/post_task.py --preset 2

# Custom task
python scripts/post_task.py --cap 1 --reward 0.006 \
  --title "Write a Solidity ERC-20 contract" \
  --desc "Production-ready with mint, burn, permit"
```

### 9. Run tests

```bash
npx hardhat test
# 36 passing (9 AgentMesh + 27 AuraGuard)
```

### 10. Open the dashboards

**AgentMesh dashboard** — open `frontend/index.html`. Connect MetaMask (Chain ID `50312`, RPC `https://api.infra.testnet.somnia.network/`).

**AuraGuard dashboard** — open `dashboard/index.html`. Enter your RiskRegistry and TaskMarket addresses (or pass them as URL params).

---

## Demo Scenarios

### AgentMesh — Full Task Pipeline

End-to-end pipeline for a **Research task** (all steps on Somnia Testnet):

1. `post_task.py --preset 1` — 0.004 STT escrowed in AgentVault
2. `TaskPosted` event fires on-chain; **Researcher-1** bids within ~10 seconds
3. Script assigns Researcher-1 (reputation: 500) via `assignTask()`
4. **Researcher-1** calls Claude to research "Top DeFi protocols on Somnia"
5. Result hash submitted on-chain via `submitResult()`
6. **Verifier-1** detects `PendingVerification`, scores with Claude (0–100)
7. `verifyAndPay()` atomically releases: `0.0034 STT` to Researcher-1 · `0.0004` to Verifier-1 · `0.0002` to protocol

**Every step is a verifiable Somnia transaction. Zero off-chain coordination.**

### AuraGuard — Live Show Demo

1. `python scripts/demo_aura_guard.py` — posts a scan task for `VulnerableHoneyToken`
2. **Sentinel** detects the contract deployment in < 1 second
3. **AuditOrchestrator** posts 3 parallel sub-tasks to TaskMarket
4. **SecurityAgent** finds: `Unlimited Mint`, `Configurable Tax (99%)`, `Sell Blacklist`, `LP Drain`
5. **SimulationAgent** confirms: `CERTAIN rug path — owner drains LP in 1 tx`
6. **SocialIntelAgent** flags: deployer wallet is < 24 hours old
7. Final score **`97 / 100 💀 CRITICAL`** written to `RiskRegistry` on-chain
8. Dashboard shows the badge appear in real-time

**From contract deployment to on-chain risk score: under 30 seconds.**

---

## Network Info

| | Testnet | Mainnet |
|---|---|---|
| **Chain ID** | `50312` | `50311` |
| **RPC** | `https://api.infra.testnet.somnia.network/` | `https://api.infra.mainnet.somnia.network/` |
| **Token** | STT | SOMI |
| **Explorer** | [shannon-explorer.somnia.network](https://shannon-explorer.somnia.network) | [explorer.somnia.network](https://explorer.somnia.network) |
| **Faucet** | [testnet.somnia.network](https://testnet.somnia.network/) | — |

Alternative faucets: [Google Cloud](https://cloud.google.com/application/web3/faucet/somnia/shannon) · [Stakely](https://stakely.io/faucet/somnia-testnet-stt) · [Thirdweb](https://thirdweb.com/somnia-shannon-testnet)

---

## Repository Structure

```
agent-mesh/
├── contracts/
│   ├── interfaces/IAgentMesh.sol          # Shared interfaces
│   ├── AgentRegistry.sol                  # Agent registration + reputation
│   ├── AgentVault.sol                     # Escrow + 85/10/5 payment split
│   ├── TaskMarket.sol                     # Core coordination contract
│   ├── RiskRegistry.sol                   # AuraGuard: on-chain risk score ledger
│   └── VulnerableHoneyToken.sol           # AuraGuard: demo rug-pull token
├── agents/
│   ├── base_agent.py                      # Wallet + Somnia + Claude foundation
│   ├── orchestrator.py                    # Task decomposition orchestrator
│   ├── research_agent.py                  # Research specialist
│   ├── code_agent.py                      # Code generation specialist
│   ├── analysis_agent.py                  # Analysis specialist
│   ├── verifier.py                        # AI quality verifier + payment trigger
│   ├── sentinel.py                        # Autonomous block watcher (task creator)
│   ├── audit_orchestrator.py              # AuraGuard: audit command brain
│   ├── security_agent.py                  # AuraGuard: static vulnerability scanner
│   ├── simulation_agent.py                # AuraGuard: attack simulator
│   └── social_intel_agent.py              # AuraGuard: deployer profiler
├── dashboard/
│   └── index.html                         # AuraGuard: real-time risk dashboard
├── frontend/
│   ├── index.html                         # AgentMesh: main app
│   ├── styles.css
│   └── app.js                             # MetaMask + ethers.js integration
├── scripts/
│   ├── deploy.js                          # Deploy core contracts
│   ├── deploy_aura_guard.js               # Deploy RiskRegistry + HoneyToken
│   ├── setup_chain.js                     # Authorize Verifier on TaskMarket
│   ├── fund_agents.js                     # Send STT to all agent wallets
│   ├── post_task.py                       # End-to-end pipeline test
│   ├── launch_aura_guard.py               # Start all AuraGuard agents
│   └── demo_aura_guard.py                 # Live show demo script
├── test/
│   ├── AgentMesh.test.js                  # Core contract tests (9 tests)
│   └── RiskRegistry.test.js               # AuraGuard contract tests (27 tests)
├── run_agents.py                           # Launch all AgentMesh agents
├── hardhat.config.js
├── package.json
└── requirements.txt
```

---

## Judging Criteria

| Criterion | Evidence |
|---|---|
| **Functionality** | AgentMesh contracts live on Somnia Testnet. Full `post_task.py` pipeline completes end-to-end. AuraGuard scans contracts and writes risk scores to `RiskRegistry` on-chain. 36/36 Hardhat tests pass. |
| **Agent-First Design** | Every agent action is an on-chain signed transaction. `TaskPosted` reactive events eliminate polling. AuditOrchestrator decomposes audits into 3 parallel on-chain sub-tasks — the blockchain is the job scheduler. |
| **Innovation** | AuraGuard: world's first autonomous, staked, multi-agent smart contract security network. Risk scores are on-chain in under 30 seconds — before users can interact with a dangerous contract. Agents with financial stakes can't afford to give wrong answers. |
| **Autonomous Performance** | Sentinel watches every Somnia block (500ms poll). Detects contract deployments, fires tasks, coordinates specialist swarm, synthesizes results, publishes to chain — **zero human input from deployment detection to risk score**. |

---

## License

MIT — build freely on Somnia.

---

*AuraAgentic × AuraGuard — Autonomous agents. Real stakes. Somnia speed.*
