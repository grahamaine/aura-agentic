# AuraAgentic — Autonomous Multi-Agent Task Economy on Somnia

> **Hackathon submission for the Somnia Agentic L1 Prize ($5,000)**

AuraAgentic is a fully on-chain multi-agent protocol where autonomous AI agents discover, bid for, execute, and verify complex tasks — paying each other in micro-transactions via Somnia's 1M-TPS chain. No human intermediaries. No off-chain coordination servers. Every agent interaction is a verifiable blockchain transaction.

---

## Live Deployment (Somnia Testnet)

| Contract | Address | Explorer |
|---|---|---|
| `AgentRegistry` | `0xe72b8E159291E152860A0313E125d3d3c96FeD4e` | [View](https://shannon-explorer.somnia.network/address/0xe72b8E159291E152860A0313E125d3d3c96FeD4e) |
| `AgentVault` | `0x77E8b2ab44f5e676F8fB8FBF05FE1b4cbc2f8c60` | [View](https://shannon-explorer.somnia.network/address/0x77E8b2ab44f5e676F8fB8FBF05FE1b4cbc2f8c60) |
| `TaskMarket` | `0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA` | [View](https://shannon-explorer.somnia.network/address/0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA) |

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

All agents share the same `BaseAgent` foundation: wallet management, Somnia RPC connection, Claude inference (`think_async`), retry logic with exponential backoff, and autonomous on-chain registration.

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

Edit `.env` and fill in:

```env
PRIVATE_KEY=<your-64-hex-deployer-key>          # no 0x prefix
ANTHROPIC_API_KEY=<your-anthropic-api-key>       # from console.anthropic.com

# Somnia Testnet (already deployed — use these)
AGENT_REGISTRY_ADDRESS=0xe72b8E159291E152860A0313E125d3d3c96FeD4e
AGENT_VAULT_ADDRESS=0x77E8b2ab44f5e676F8fB8FBF05FE1b4cbc2f8c60
TASK_MARKET_ADDRESS=0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA

# One private key per agent wallet (generate 5 new wallets)
ORCHESTRATOR_KEY=<hex>
RESEARCH_AGENT_KEY=<hex>
CODE_AGENT_KEY=<hex>
ANALYSIS_AGENT_KEY=<hex>
VERIFIER_AGENT_KEY=<hex>
```

Get free STT from the [Somnia Faucet](https://testnet.somnia.network/).

### 3. Deploy contracts (optional — already live)

The contracts are already deployed on Somnia Testnet (see addresses above). To redeploy your own:

```bash
npx hardhat run scripts/deploy.js --network somnia_testnet
npx hardhat run scripts/setup_chain.js --network somnia_testnet   # authorize Verifier
```

### 4. Fund agent wallets

```bash
npx hardhat run scripts/fund_agents.js --network somnia_testnet
```

### 5. Run the agents

```bash
# Start all 5 agents (auto-registers on-chain if new)
python run_agents.py

# Dry-run config check (no network calls)
python run_agents.py --dry-run

# Start only specific agents
python run_agents.py --agent orch verifier
```

### 6. Post a task and watch the pipeline

In a second terminal:

```bash
# Use a preset task (Research, CodeGen, or Analysis)
python scripts/post_task.py

# Pick a specific preset (1–5)
python scripts/post_task.py --preset 2

# Custom task
python scripts/post_task.py --cap 1 --reward 0.006 \
  --title "Write a Solidity ERC-20 contract" \
  --desc "Production-ready with mint, burn, permit"
```

The script posts the task on-chain, polls for agent bids, assigns the highest-reputation bidder, waits for result submission, and displays the final verified output with tx links.

### 7. Run tests

```bash
npx hardhat test
```

### 8. Open the dashboard

Open `frontend/index.html` in a browser. Connect MetaMask (Somnia Testnet: Chain ID `50312`, RPC `https://api.infra.testnet.somnia.network/`).

---

## Demo Scenario

End-to-end pipeline for a **Research task** (all steps verified on Somnia Testnet):

1. User calls `post_task.py --preset 1` — 0.004 STT escrowed in AgentVault
2. `TaskPosted` event fires on-chain; **Researcher-1** bids within ~10 seconds
3. Script assigns Researcher-1 (reputation: 500) on-chain via `assignTask()`
4. **Researcher-1** calls Claude to research "Top DeFi protocols on Somnia"
5. Result hash submitted on-chain via `submitResult()`
6. **Verifier-1** detects `PendingVerification`, scores with Claude (0-100)
7. `verifyAndPay()` atomically releases 0.0034 STT to Researcher-1, 0.0004 to Verifier-1, 0.0002 to protocol

**Every step is a verifiable Somnia transaction. Zero off-chain coordination.**

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
│   ├── interfaces/IAgentMesh.sol     # Shared interfaces
│   ├── AgentRegistry.sol             # Agent registration + reputation
│   ├── AgentVault.sol                # Escrow + 85/10/5 payment split
│   └── TaskMarket.sol                # Core coordination contract
├── agents/
│   ├── base_agent.py                 # Wallet + Somnia + Claude foundation
│   ├── orchestrator.py               # Task decomposition orchestrator
│   ├── research_agent.py             # Research specialist
│   ├── code_agent.py                 # Code generation specialist
│   ├── analysis_agent.py             # Analysis specialist
│   └── verifier.py                   # AI quality verifier + payment trigger
├── scripts/
│   ├── deploy.js                     # Contract deployment
│   ├── setup_chain.js                # Authorize Verifier on TaskMarket
│   ├── fund_agents.js                # Send STT to all agent wallets
│   └── post_task.py                  # End-to-end pipeline test (5 presets)
├── test/
│   └── AgentMesh.test.js             # Hardhat contract test suite
├── frontend/
│   ├── index.html                    # Live dashboard
│   ├── styles.css
│   └── app.js                        # MetaMask + ethers.js integration
├── run_agents.py                     # Launch all 5 agents with auto-restart
├── hardhat.config.js
├── package.json
└── requirements.txt
```

---

## Judging Criteria

| Criterion | Evidence |
|---|---|
| **Functionality** | Contracts deployed live on Somnia Testnet; end-to-end `post_task.py` completes the full pipeline; Hardhat test suite passes |
| **Agent-First Design** | Every agent action is an on-chain transaction; reactive `TaskPosted` events eliminate polling; reputation system drives bidding |
| **Innovation** | On-chain task decomposition via OrchestratorAgent; AI quality scores embedded in payment transactions; 85/10/5 payment DAG |
| **Autonomous Performance** | Agents self-register, self-bid, self-execute, and self-verify — zero human input from task post to payment |

---

## License

MIT — build freely on Somnia.

---

*AuraAgentic — Where autonomous agents meet the speed of Somnia.*
