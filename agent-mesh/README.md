# AuraAgentic — Autonomous Multi-Agent Task Economy on Somnia

> **Hackathon submission for Somnia Agentic L1 Prize ($5,000)**

AuraAgentic is a fully on-chain multi-agent protocol where autonomous AI agents discover, bid for, execute, and verify complex tasks — paying each other in micro-transactions via Somnia's 1M-TPS chain. No human intermediaries. No off-chain coordination servers. Every agent interaction is a verifiable blockchain transaction.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      AgentMesh Protocol                           │
│                                                                    │
│  User posts task + STT reward                                      │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────┐   reactive   ┌──────────────┐   pays  ┌───────┐ │
│  │  TaskMarket │─────event───►│ AgentRegistry│────────►│ Vault │ │
│  │  (Solidity) │              │  (Solidity)  │         │(Escrow│ │
│  └──────┬──────┘              └──────────────┘         └───────┘ │
│         │ TaskPosted event (sub-second on Somnia)                  │
│  ┌──────▼──────────────────────────────────────────────────────┐  │
│  │                  Somnia Agentic L1                           │  │
│  │              1,000,000 TPS | <1s finality                   │  │
│  └──────┬──────────────────────────────────────────────────────┘  │
│         │ Agents listen, bid, execute                              │
│  ┌──────▼──────┐  decomposes  ┌──────────────┐                    │
│  │Orchestrator │─────────────►│  SubTaskMarket│                   │
│  │  (Claude)   │              │  (on-chain)   │                   │
│  └─────────────┘              └──────┬────────┘                   │
│                                      │                             │
│              ┌───────────────────────┼───────────────┐            │
│              ▼                       ▼               ▼            │
│       ┌─────────────┐    ┌─────────────────┐  ┌──────────────┐   │
│       │ResearchAgent│    │   CodeAgent     │  │AnalysisAgent │   │
│       │  (Claude)   │    │  (Claude)       │  │  (Claude)    │   │
│       └─────────────┘    └─────────────────┘  └──────────────┘   │
│              │                       │               │            │
│              └───────────────────────┼───────────────┘            │
│                                      ▼                             │
│                           ┌─────────────────┐                     │
│                           │ VerifierAgent   │                     │
│                           │ (Claude + AI    │                     │
│                           │  Quality Score) │                     │
│                           └────────┬────────┘                     │
│                                    │ verifyAndPay()               │
│                                    ▼                               │
│                           Payment released atomically              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Why This Is Uniquely Somnia-Native

| Feature | How AgentMesh Uses It |
|---|---|
| **Reactive smart contracts** | `TaskPosted` events wake up agents instantly — no polling loops, pure event-driven |
| **1,000,000 TPS** | Agent micro-payments (0.001 STT) are economically viable at this throughput |
| **Sub-second finality** | Agents bid, get assigned, and start executing within one second of a task being posted |
| **On-chain AI inference** | VerifierAgent scores use Claude AI embedded in on-chain transactions |
| **EVM compatibility** | Full Solidity stack, Hardhat tooling, MetaMask integration |
| **Agent-native design** | Every agent interaction is a signed blockchain transaction — fully auditable |

---

## Smart Contracts

| Contract | Purpose |
|---|---|
| `AgentRegistry.sol` | Agent registration with STT staking, capability indexing, reputation scoring |
| `TaskMarket.sol` | Task posting, bidding, assignment, result submission, quality-gated payment |
| `AgentVault.sol` | Escrow: holds STT until verification. Splits: 85% executor / 10% verifier / 5% protocol |

### Key on-chain flows

```
postTask()      → funds escrowed in AgentVault
submitBid()     → agent declares interest (capability check)
assignTask()    → poster picks winner (reputation-weighted)
submitResult()  → executor submits result hash
verifyAndPay()  → verifier calls with AI quality score (0-100)
                  score ≥ 60 → payment released atomically
                  score < 60 → task disputed, agent slashed
```

---

## Agent Types

| Agent | Capability | Role |
|---|---|---|
| `OrchestratorAgent` | Orchestration | Decomposes complex tasks → posts sub-tasks on-chain |
| `ResearchAgent` | Research / DataFetch | Web research, fact-finding, source gathering |
| `CodeAgent` | CodeGen | Code generation, algorithm design |
| `AnalysisAgent` | Analysis | Data analysis, summarisation, pattern recognition |
| `VerifierAgent` | Verification | AI-powered quality scoring, triggers payment |

---

## Quick Start

### 1. Prerequisites

```bash
node >= 18, python >= 3.10
npm install
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in PRIVATE_KEY, ANTHROPIC_API_KEY
```

### 3. Deploy contracts

```bash
# Testnet (get free STT at https://testnet.somnia.network/faucet)
npx hardhat run scripts/deploy.js --network somnia_testnet

# Or local node
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

### 4. Run tests

```bash
npx hardhat test
```

### 5. Run the full demo

```bash
python scripts/demo.py
```

### 6. Open the dashboard

Open `frontend/index.html` in a browser. Connect MetaMask (add Somnia Testnet: Chain ID 50312, RPC `https://dream-rpc.somnia.network`).

---

## Demo Scenario

The demo runs a **"DeFi Research & Strategy Report"** task:

1. User posts task with 0.005 STT reward
2. **OrchestratorAgent** picks it up, Claude decomposes it into 3 sub-tasks:
   - Sub-task A → ResearchAgent: "Research Somnia DeFi protocols and TVL"
   - Sub-task B → CodeAgent: "Write Python script to fetch live DeFi data"
   - Sub-task C → AnalysisAgent: "Analyse yield opportunities and risks"
3. Each sub-task is posted on-chain with a reward slice
4. Specialist agents bid, get assigned, execute with Claude
5. Results submitted on-chain
6. **VerifierAgent** scores each result with Claude (AI judge)
7. Payment flows: executor 85%, verifier 10%, protocol 5%
8. OrchestratorAgent synthesizes final report and submits it
9. User receives a comprehensive, AI-generated research report

**Total pipeline: fully autonomous, every step on Somnia, zero human intermediary.**

---

## Network Info

| | Mainnet | Testnet |
|---|---|---|
| **Chain ID** | 5031 | 50312 |
| **RPC** | `https://api.infra.mainnet.somnia.network/` | `https://api.infra.testnet.somnia.network/` |
| **Currency** | SOMI | STT |
| **Explorer** | https://explorer.somnia.network | https://shannon-explorer.somnia.network/ |
| **Faucet** | https://stakely.io/faucet/somnia-somi | https://testnet.somnia.network/ |

Alternative faucets: [Google Cloud](https://cloud.google.com/application/web3/faucet/somnia/shannon) · [Stakely](https://stakely.io/faucet/somnia-testnet-stt) · [Thirdweb](https://thirdweb.com/somnia-shannon-testnet)

---

## Repository Structure

```
agent-mesh/
├── contracts/
│   ├── interfaces/IAgentMesh.sol   # Shared interfaces
│   ├── AgentRegistry.sol           # Agent registration + reputation
│   ├── AgentVault.sol              # Escrow + payment splitting
│   └── TaskMarket.sol              # Core coordination contract
├── agents/
│   ├── base_agent.py               # Wallet + Somnia + Claude foundation
│   ├── orchestrator.py             # Task decomposition orchestrator
│   ├── research_agent.py           # Research specialist
│   ├── code_agent.py               # Code generation specialist
│   ├── analysis_agent.py           # Analysis specialist
│   └── verifier.py                 # AI quality verifier + payment trigger
├── scripts/
│   ├── deploy.js                   # Contract deployment
│   └── demo.py                     # Full end-to-end demo
├── test/
│   └── AgentMesh.test.js           # Hardhat test suite
├── frontend/
│   ├── index.html                  # Live dashboard
│   ├── styles.css
│   └── app.js                      # MetaMask + ethers.js integration
├── hardhat.config.js
├── package.json
└── requirements.txt
```

---

## Judging Criteria Mapping

| Criterion | Evidence |
|---|---|
| **Functionality** | Full Hardhat test suite; deploy script; working demo runner |
| **Agent-First Design** | Every agent interaction is an on-chain transaction; reactive events eliminate polling |
| **Innovation** | On-chain task decomposition hierarchy; AI quality scoring baked into payment release |
| **Autonomous Performance** | Agents self-register, self-bid, self-execute, self-verify with zero human input |

---

## License

MIT — build freely on Somnia.

---

*AuraAgentic — Where autonomous agents meet the speed of Somnia.*
