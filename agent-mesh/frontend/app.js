/* ═══════════════════════════════════════════════════════════════════════════
   AuraAgentic — Frontend App
   Multi-view SPA: Dashboard · Agents · Tasks · Pipeline · Analytics
   Includes live demo simulation showing autonomous agent behaviour
═══════════════════════════════════════════════════════════════════════════ */

// ── Constants ────────────────────────────────────────────────────────────────
const SOMNIA_CHAIN_ID     = "0xc488"; // 50312 — testnet Shannon
const SOMNIA_RPC          = "https://api.infra.testnet.somnia.network";
const MAINNET_RPC         = "https://api.infra.mainnet.somnia.network";
const EXPLORER_TESTNET    = "https://shannon-explorer.somnia.network/";
const EXPLORER_MAINNET    = "https://explorer.somnia.network/";

// ── Deployed contract addresses (Somnia testnet, 2026-05-20) ────────────────
const CONTRACT_REGISTRY = "0xe72b8E159291E152860A0313E125d3d3c96FeD4e";
const CONTRACT_VAULT    = "0x77E8b2ab44f5e676F8fB8FBF05FE1b4cbc2f8c60";
const CONTRACT_MARKET   = "0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA";
const EXPLORER_ADDR     = (addr) => `${EXPLORER_TESTNET}address/${addr}`;

const CAP_LABELS  = ["Research","Code Gen","Analysis","Verification","Orchestration","Data Fetch"];
const CAP_DESCS   = [
  "Web search, data gathering, fact-checking",
  "Write, debug and optimise code",
  "Process data, find patterns, generate insights",
  "AI quality scoring and result validation",
  "Decompose complex tasks into sub-tasks",
  "Fetch live on-chain and off-chain data",
];
const CAP_COLORS  = ["#00d4ff","#6c63ff","#f59e0b","#a78bfa","#ec4899","#22c55e"];
const CAP_BG      = ["rgba(0,212,255,.12)","rgba(108,99,255,.12)","rgba(245,158,11,.12)","rgba(167,139,250,.12)","rgba(236,72,153,.12)","rgba(34,197,94,.12)"];
const STATUS_LABELS = ["Open","Assigned","In Progress","Pending Verify","Completed","Disputed","Cancelled"];
const STATUS_CLS    = ["s-open","s-assigned","s-inprogress","s-pending","s-completed","s-disputed","s-open"];
const DOT_CLS       = ["dot-open","dot-assigned","dot-inprogress","dot-pending","dot-completed","dot-disputed","dot-open"];
const PRIORITY_LBL  = ["Low","Medium","High","Critical"];

const AGENT_EMOJIS = ["🔬","💻","📊","🛡️","🎯","📡"];

// ── Contract ABIs (full, matches deployed Solidity) ───────────────────────────
const REGISTRY_ABI_FULL = [
  "function register(string name, string endpoint, uint8[] caps) payable",
  "function getAgent(address wallet) view returns (tuple(address wallet, string name, string endpoint, uint8[] capabilities, uint256 stake, uint256 completedTasks, uint256 reputation, uint8 status, uint256 registeredAt))",
  "function getAgentsByCapability(uint8 cap) view returns (address[])",
  "function isActive(address agent) view returns (bool)",
  "function totalAgents() view returns (uint256)",
  "event AgentRegistered(address indexed agent, string name, uint8[] capabilities)",
  "event ReputationUpdated(address indexed agent, uint256 newScore)",
];

const MARKET_ABI_FULL = [
  "function postTask(string title, string description, string inputData, uint8 requiredCapability, uint256 deadline, uint8 priority) payable returns (uint256 taskId)",
  "function postSubTask(uint256 parentId, string title, string description, string inputData, uint8 requiredCapability, uint256 deadline) payable returns (uint256 subTaskId)",
  "function submitBid(uint256 taskId)",
  "function assignTask(uint256 taskId, address agent)",
  "function submitResult(uint256 taskId, string resultHash)",
  "function verifyAndPay(uint256 taskId, uint256 qualityScore)",
  "function setVerifier(address v)",
  "function cancelTask(uint256 taskId)",
  "function getTask(uint256 taskId) view returns (tuple(uint256 id, address poster, string title, string description, string inputData, uint8 requiredCapability, uint256 reward, uint256 deadline, uint8 status, address assignedAgent, address[] bidders, string resultHash, uint256 qualityScore, uint8 priority, uint256 createdAt))",
  "function getOpenTasks() view returns (uint256[])",
  "function getSubTasks(uint256 parentId) view returns (uint256[])",
  "function getBidders(uint256 taskId) view returns (address[])",
  "function taskCount() view returns (uint256)",
  "event TaskPosted(uint256 indexed taskId, address indexed poster, uint256 reward)",
  "event BidSubmitted(uint256 indexed taskId, address indexed agent)",
  "event TaskAssigned(uint256 indexed taskId, address indexed agent)",
  "event TaskCompleted(uint256 indexed taskId, address indexed agent, uint256 qualityScore)",
  "event TaskDisputed(uint256 indexed taskId, address indexed disputer)",
  "event SubTaskCreated(uint256 indexed parentId, uint256 indexed subTaskId)",
];
const TASK_TOPICS  = [
  "Research latest DeFi TVL trends on Somnia",
  "Build a Python price feed aggregator",
  "Analyse on-chain agent activity patterns",
  "Write a smart contract for token vesting",
  "Research quantum computing breakthroughs",
  "Generate a market sentiment analysis report",
  "Code a gas-optimised ERC-20 contract",
  "Analyse Somnia validator performance data",
  "Research AI agent coordination protocols",
  "Build a TypeScript SDK for Somnia agents",
  "Summarise top 10 Somnia ecosystem projects",
  "Write automated tests for AgentRegistry.sol",
];

// ── Registration state (persists across step changes) ────────────────────────
const regState = {
  step: 1,
  name: "",
  desc: "",
  emoji: "🔬",
  caps: [],
  stake: 0.1,
};

// ── App State ─────────────────────────────────────────────────────────────────
const state = {
  view: "dashboard",
  wallet: null,
  balance: "0",
  demoMode: true,
  blockNumber: 4812340,
  tasks: [],
  agents: [],
  events: [],
  metrics: { total:0, completed:0, disputed:0, sttOut:0, qualitySum:0, qualityCount:0, autonomyPct:0 },
  taskFilter: "all",
  agentFilter: -1,
  pipelineRunning: false,
  pipelineStep: 0,
  pipelineLog: [],
};

// ── Demo seed data ─────────────────────────────────────────────────────────────
function seedDemo() {
  state.agents = [
    { id:"0xOrch",  name:"Orchestrator-1", caps:[4],     rep:920, tasks:47, earnings:0.234, status:1 },
    { id:"0xRes",   name:"Researcher-1",   caps:[0,5],   rep:875, tasks:38, earnings:0.19,  status:1 },
    { id:"0xCode",  name:"Coder-1",        caps:[1],     rep:830, tasks:29, earnings:0.145, status:1 },
    { id:"0xAnal",  name:"Analyst-1",      caps:[2],     rep:790, tasks:22, earnings:0.11,  status:1 },
    { id:"0xVer",   name:"Verifier-1",     caps:[3],     rep:960, tasks:94, earnings:0.047, status:1 },
  ];

  const now = Math.floor(Date.now()/1000);
  state.tasks = [
    { id:1,  title:"Research Somnia DeFi TVL",           cap:0, status:4, reward:0.008, poster:"0xUser1", assigned:"0xRes",  quality:88, created:now-3600, bidders:2 },
    { id:2,  title:"Build token price aggregator",       cap:1, status:4, reward:0.012, poster:"0xUser2", assigned:"0xCode", quality:92, created:now-2800, bidders:3 },
    { id:3,  title:"Analyse agent coordination data",    cap:2, status:4, reward:0.006, poster:"0xUser3", assigned:"0xAnal", quality:79, created:now-1800, bidders:2 },
    { id:4,  title:"Research quantum computing trends",  cap:0, status:3, reward:0.010, poster:"0xUser1", assigned:"0xRes",  quality:0,  created:now-600,  bidders:1 },
    { id:5,  title:"Write gas-optimised ERC-20",         cap:1, status:2, reward:0.015, poster:"0xUser4", assigned:"0xCode", quality:0,  created:now-300,  bidders:2 },
    { id:6,  title:"Summarise Somnia ecosystem",         cap:4, status:1, reward:0.020, poster:"0xUser2", assigned:"0xOrch", quality:0,  created:now-120,  bidders:3 },
    { id:7,  title:"Fetch Uniswap V3 pool data",         cap:5, status:0, reward:0.005, poster:"0xUser5", assigned:null,     quality:0,  created:now-60,   bidders:0 },
    { id:8,  title:"Market sentiment analysis report",   cap:2, status:0, reward:0.009, poster:"0xUser3", assigned:null,     quality:0,  created:now-30,   bidders:1 },
  ];

  recomputeMetrics();

  addEvent("info",    "🚀", "AuraAgentic demo started", "5 agents active on Somnia testnet");
  addEvent("success", "✅", "Task #3 completed",         "Analyst-1 scored 79/100 — paid 0.006 STT");
  addEvent("success", "✅", "Task #2 completed",         "Coder-1 scored 92/100 — paid 0.012 STT");
  addEvent("success", "✅", "Task #1 completed",         "Researcher-1 scored 88/100 — paid 0.008 STT");
  addEvent("info",    "🔗", "Block #4812340 mined",       "Somnia testnet | <1s finality");
}

function recomputeMetrics() {
  const m = state.metrics;
  m.total     = state.tasks.length;
  m.completed = state.tasks.filter(t => t.status === 4).length;
  m.disputed  = state.tasks.filter(t => t.status === 5).length;
  m.sttOut    = state.tasks.filter(t => t.status === 4).reduce((s,t) => s + t.reward, 0);
  const scored = state.tasks.filter(t => t.quality > 0);
  m.qualitySum   = scored.reduce((s,t) => s + t.quality, 0);
  m.qualityCount = scored.length;
  m.autonomyPct  = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
  updateBadges();
}

// ── Event log ─────────────────────────────────────────────────────────────────
function addEvent(type, icon, title, desc) {
  const ev = { type, icon, title, desc, time: new Date().toLocaleTimeString() };
  state.events.unshift(ev);
  if (state.events.length > 60) state.events.pop();
  if (state.view === "dashboard") renderActivityFeed();
}

// ── Router ────────────────────────────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.view === view);
  });
  const titles = { dashboard:"Dashboard", agents:"Agents", tasks:"Task Marketplace", pipeline:"Agent Pipeline", analytics:"Analytics", register:"Register Agent", portfolio:"My Portfolio", sentinel:"Sentinel — Live Intelligence" };
  document.getElementById("topbar-title").textContent = titles[view] || view;
  render();
}

function render() {
  const content = document.getElementById("content");
  const views = { dashboard: renderDashboard, agents: renderAgents, tasks: renderTasks, pipeline: renderPipeline, analytics: renderAnalytics, register: renderRegister, portfolio: renderPortfolio, sentinel: renderSentinel };
  content.innerHTML = "";
  if (views[state.view]) views[state.view](content);
}

// ── DASHBOARD view ─────────────────────────────────────────────────────────────
function renderDashboard(root) {
  const avgQ = state.metrics.qualityCount > 0
    ? Math.round(state.metrics.qualitySum / state.metrics.qualityCount) : 0;

  const chainConnected = state.blockNumber > 1000000;
  root.innerHTML = `
  <div class="view">
    <!-- Chain status banner -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:10px 14px;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15);border-radius:var(--r-md)">
      <span style="width:8px;height:8px;border-radius:50%;background:${chainConnected?"var(--green)":"var(--yellow)"};box-shadow:0 0 6px ${chainConnected?"var(--green)":"var(--yellow)"};flex-shrink:0;display:inline-block"></span>
      <span style="font-size:0.72rem;color:var(--t2);letter-spacing:0.06em;text-transform:uppercase;flex:1">${chainConnected?"Somnia Testnet · Live chain data · Contracts deployed":"Connecting to Somnia Testnet…"}</span>
      <a href="${EXPLORER_ADDR(CONTRACT_MARKET)}" target="_blank" style="font-size:0.65rem;color:var(--cyan);text-decoration:none;letter-spacing:0.05em">View on Explorer ↗</a>
    </div>
    <!-- Stat row -->
    <div class="grid-4" style="margin-bottom:16px">
      ${statCard("Active Agents", state.agents.filter(a=>a.status===1).length, "🤖", "c-indigo", "live", "Live")}
      ${statCard("Open Tasks",    state.tasks.filter(t=>t.status===0).length,  "📋", "c-cyan",   "up",   "+" + state.tasks.filter(t=>t.status===0).length)}
      ${statCard("STT Distributed", state.metrics.sttOut.toFixed(3), "💎", "c-green", "up", "+" + state.tasks.filter(t=>t.status===4).length + " done")}
      ${statCard("Avg Quality",   avgQ + "/100", "⭐", "c-purple", "up", avgQ >= 75 ? "Good" : "Fair")}
    </div>

    <!-- Network Intelligence -->
    <div class="net-intel-grid" style="margin-bottom:16px">
      <div class="net-intel-stat">
        <div class="nis-val" style="color:var(--cyan)" id="ni-block">${state.blockNumber.toLocaleString()}</div>
        <div class="nis-label">Current Block</div>
      </div>
      <div class="net-intel-stat">
        <div class="nis-val" style="color:var(--green)" id="ni-tps">1M+ TPS</div>
        <div class="nis-label">Network Throughput</div>
      </div>
      <div class="net-intel-stat">
        <div class="nis-val" style="color:var(--indigo)">&lt; 1s</div>
        <div class="nis-label">Avg Finality</div>
      </div>
      <div class="net-intel-stat">
        <div class="nis-val" style="color:var(--yellow)">${(state.metrics.sttOut * 0.05).toFixed(4)}</div>
        <div class="nis-label">Protocol Revenue (STT)</div>
      </div>
    </div>

    <!-- Main grid -->
    <div class="two-col" style="margin-bottom:16px;align-items:start">
      <!-- Agent Mesh Visualizer -->
      <div class="card">
        <div class="card-header">
          <h2>🕸️ Agent Mesh — Live</h2>
          <span class="pill" style="background:rgba(34,197,94,.12);color:var(--green)">● 5 Online</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="mesh-canvas" id="mesh-canvas"></div>
        </div>
      </div>

      <!-- Live Task Feed -->
      <div class="card">
        <div class="card-header">
          <h2>⚡ Live Task Feed</h2>
          <button class="btn btn-secondary" style="font-size:0.68rem;padding:4px 10px" onclick="navigate('tasks')">View All →</button>
        </div>
        <div class="card-body">
          <div class="task-list" id="dash-task-list">
            ${state.tasks.slice(0,5).map(taskItemHTML).join("")}
          </div>
        </div>
      </div>
    </div>

    <!-- Deployed Contracts -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h2>⬡ Live Contracts — Somnia Testnet</h2>
        <span class="pill" style="background:rgba(34,197,94,.12);color:var(--green)">● Deployed</span>
      </div>
      <div class="card-body" style="padding:10px 14px">
        <div style="display:flex;flex-direction:column;gap:8px">
          ${contractRow("AgentRegistry", CONTRACT_REGISTRY, "Agent registration, staking & reputation")}
          ${contractRow("AgentVault",    CONTRACT_VAULT,    "Escrow — holds STT until task verified")}
          ${contractRow("TaskMarket",    CONTRACT_MARKET,   "Task lifecycle, bidding & payment release")}
        </div>
      </div>
    </div>

    <!-- Autonomy + Pipeline + Activity -->
    <div class="three-col">
      <!-- Autonomy meter -->
      <div class="card">
        <div class="card-header"><h2>🧠 Autonomous Performance</h2></div>
        <div class="card-body">
          <div style="text-align:center;margin-bottom:14px">
            <div style="font-size:2.4rem;font-weight:800;background:var(--grad-brand);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${state.metrics.autonomyPct}%</div>
            <div style="font-size:0.72rem;color:var(--t2);margin-top:2px">Tasks completed autonomously</div>
          </div>
          <div class="autonomy-meter">
            <div class="autonomy-bar-wrap">
              <div class="autonomy-bar-fill" style="width:${state.metrics.autonomyPct}%"></div>
            </div>
            <div class="autonomy-labels"><span>0%</span><span>Human-Free</span><span>100%</span></div>
          </div>
          <div class="divider"></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${miniStat("Tasks Completed", state.metrics.completed, "var(--green)")}
            ${miniStat("Tasks Disputed",  state.metrics.disputed,  "var(--red)")}
            ${miniStat("STT Distributed", state.metrics.sttOut.toFixed(3) + " STT", "var(--cyan)")}
            ${miniStat("Agents Active",   state.agents.length, "var(--indigo)")}
          </div>
        </div>
      </div>

      <!-- Agent top performers -->
      <div class="card">
        <div class="card-header"><h2>🏆 Top Agents</h2></div>
        <div class="card-body" style="padding:10px 14px">
          ${state.agents.sort((a,b)=>b.rep-a.rep).map((ag,i) => agentRankRow(ag, i)).join("")}
        </div>
      </div>

      <!-- Activity log -->
      <div class="card">
        <div class="card-header">
          <h2>📡 Activity Log <span class="demo-dot" style="margin-left:4px"></span></h2>
        </div>
        <div class="card-body" style="padding:8px 10px">
          <div class="activity-feed" id="activity-feed">
            ${state.events.slice(0,12).map(activityItemHTML).join("")}
          </div>
        </div>
      </div>
    </div>
  </div>`;

  setTimeout(() => renderMeshViz(), 50);
  bindTaskClicks(root);
}

function statCard(label, val, icon, color, trendType, trendText) {
  return `
  <div class="stat-card ${color}">
    <div class="stat-icon ${color}">${icon}</div>
    <div class="stat-value">${val}</div>
    <div class="stat-label">${label}</div>
    <span class="stat-trend ${trendType}">${trendText}</span>
  </div>`;
}

function contractRow(name, addr, desc) {
  return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="width:110px;font-size:0.72rem;font-weight:700;color:var(--cyan);flex-shrink:0">${name}</div>
    <a href="${EXPLORER_ADDR(addr)}" target="_blank" rel="noopener"
       style="font-family:var(--font-mono);font-size:0.68rem;color:var(--indigo);text-decoration:none;flex-shrink:0"
       title="View on Somnia Explorer">${addr.slice(0,10)}...${addr.slice(-8)} ↗</a>
    <div style="font-size:0.66rem;color:var(--t2);flex:1">${desc}</div>
  </div>`;
}

function miniStat(label, val, color) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem">
    <span style="color:var(--t2)">${label}</span>
    <span style="font-weight:700;color:${color}">${val}</span>
  </div>`;
}

function agentRankRow(ag, rank) {
  const primary = ag.caps[0] ?? 0;
  const color = CAP_COLORS[primary];
  const medals = ["🥇","🥈","🥉","4️⃣","5️⃣"];
  return `
  <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)" class="agent-row-click" data-id="${ag.id}">
    <span style="font-size:1rem">${medals[rank]||rank+1}</span>
    <div style="width:30px;height:30px;border-radius:50%;background:${CAP_BG[primary]};color:${color};display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700">${ag.name[0]}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:0.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ag.name}</div>
      <div style="font-size:0.62rem;color:var(--t2)">${ag.tasks} tasks</div>
    </div>
    <div style="font-size:0.78rem;font-weight:700;color:${color}">${ag.rep}</div>
  </div>`;
}

// ── Mesh Visualizer ────────────────────────────────────────────────────────────
function renderMeshViz() {
  const canvas = document.getElementById("mesh-canvas");
  if (!canvas) return;
  const W = canvas.offsetWidth, H = canvas.offsetHeight || 220;

  const positions = [
    { x: 0.5,  y: 0.18 }, // Orchestrator — top center
    { x: 0.15, y: 0.55 }, // Researcher
    { x: 0.38, y: 0.75 }, // Coder
    { x: 0.62, y: 0.75 }, // Analyst
    { x: 0.85, y: 0.55 }, // Verifier
  ];

  const connections = [[0,1],[0,2],[0,3],[0,4],[1,4],[2,4],[3,4]];

  // Draw SVG connections
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("style","position:absolute;inset:0;width:100%;height:100%;pointer-events:none");
  connections.forEach(([a,b]) => {
    const pa = positions[a], pb = positions[b];
    const line = document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1", pa.x * W); line.setAttribute("y1", pa.y * H);
    line.setAttribute("x2", pb.x * W); line.setAttribute("y2", pb.y * H);
    line.setAttribute("stroke","rgba(108,99,255,0.2)");
    line.setAttribute("stroke-width","1");
    line.setAttribute("stroke-dasharray","4 4");
    svg.appendChild(line);
  });
  canvas.appendChild(svg);

  // Agent nodes
  state.agents.forEach((ag, i) => {
    const pos = positions[i];
    const cap = ag.caps[0] ?? 0;
    const color = CAP_COLORS[cap];
    const bg = CAP_BG[cap];
    const node = document.createElement("div");
    node.className = "mesh-node";
    node.style.cssText = `left:${pos.x*100}%;top:${pos.y*100}%;transform:translate(-50%,-50%)`;
    node.innerHTML = `
      <div class="mesh-node-avatar active" style="background:${bg};color:${color};border-color:${color}40">
        ${AGENT_EMOJIS[cap]}
      </div>
      <div class="mesh-node-label">${ag.name.split("-")[0]}</div>
    `;
    node.onclick = () => openAgentModal(ag);
    canvas.appendChild(node);
  });

  // Animate data packets along edges
  animatePackets(canvas, positions, connections, W, H);
}

function animatePackets(canvas, positions, connections, W, H) {
  function spawnPacket() {
    const [a,b] = connections[Math.floor(Math.random()*connections.length)];
    const pa = positions[a], pb = positions[b];
    const dot = document.createElement("div");
    dot.style.cssText = `position:absolute;width:6px;height:6px;border-radius:50%;background:var(--indigo);box-shadow:0 0 6px var(--indigo);pointer-events:none;z-index:3;transition:none`;
    dot.style.left = `${pa.x*W}px`;
    dot.style.top  = `${pa.y*H}px`;
    canvas.appendChild(dot);
    const dur = 800 + Math.random()*600;
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / dur, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      dot.style.left = `${(pa.x + (pb.x - pa.x) * ease) * W - 3}px`;
      dot.style.top  = `${(pa.y + (pb.y - pa.y) * ease) * H - 3}px`;
      dot.style.opacity = t < 0.1 ? t*10 : t > 0.9 ? (1-t)*10 : "1";
      if (t < 1) requestAnimationFrame(step);
      else dot.remove();
    }
    requestAnimationFrame(step);
  }
  const iv = setInterval(() => { if (!document.getElementById("mesh-canvas")) { clearInterval(iv); return; } spawnPacket(); }, 600);
}

// ── AGENTS view ────────────────────────────────────────────────────────────────
function renderAgents(root) {
  const caps = [-1, ...new Set(state.agents.flatMap(a=>a.caps))].sort();

  root.innerHTML = `
  <div class="view">
    <div class="page-header">
      <h1>Registered Agents</h1>
      <p>All autonomous AI agents staked and active on Somnia Agentic L1</p>
    </div>

    <!-- Capability filters -->
    <div class="filter-tabs" style="margin-bottom:18px">
      <button class="filter-tab ${state.agentFilter===-1?"active":""}" onclick="setAgentFilter(-1)">All Agents</button>
      ${caps.filter(c=>c>=0).map(c=>`
        <button class="filter-tab ${state.agentFilter===c?"active":""}" onclick="setAgentFilter(${c})"
          style="${state.agentFilter===c?`background:${CAP_COLORS[c]}; border-color:${CAP_COLORS[c]};`:""}">
          ${CAP_LABELS[c]}
        </button>`).join("")}
    </div>

    <!-- Agent grid -->
    <div class="agent-grid" id="agent-grid">
      ${filteredAgents().map(agentCardHTML).join("")}
    </div>

    <div class="divider" style="margin:24px 0"></div>

    <!-- Two-col: Reputation Leaderboard + Capability Distribution -->
    <div class="two-col" style="align-items:start;gap:18px">
      <!-- Reputation Leaderboard -->
      <div class="card">
        <div class="card-header">
          <h2>🏆 Reputation Leaderboard</h2>
          <span style="font-size:0.68rem;color:var(--t2)">On-chain · updated per task</span>
        </div>
        <div class="card-body" style="padding:10px 14px">
          ${[...state.agents].sort((a,b)=>b.rep-a.rep).map((ag,i) => {
            const cap = ag.caps[0]??0;
            const color = CAP_COLORS[cap];
            const medals = ["🥇","🥈","🥉","4️⃣","5️⃣"];
            const rankClass = i<3?`rank-${i+1}`:"";
            const repPct = (ag.rep/1000)*100;
            return `
            <div class="rep-leader-row ${rankClass}" onclick="openAgentModal(state.agents.find(a=>a.id==='${ag.id}'))">
              <div class="rr-medal">${medals[i]||i+1}</div>
              <div class="rr-avatar" style="background:${CAP_BG[cap]};color:${color}">${AGENT_EMOJIS[cap]}</div>
              <div class="rr-info">
                <div class="rr-name">${ag.name}</div>
                <div class="rr-caps">${ag.caps.map(c=>CAP_LABELS[c]).join(" · ")}</div>
              </div>
              <div class="rr-right">
                <div class="rr-score" style="color:${color}">${ag.rep}<span style="font-size:0.62rem;color:var(--t2);font-weight:400">/1000</span></div>
                <div class="rr-tasks">${ag.tasks} tasks</div>
                <div class="rr-bar"><div class="rr-bar-fill" style="width:${repPct}%;background:${color}"></div></div>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>

      <!-- Capability Distribution -->
      <div class="card">
        <div class="card-header"><h2>📊 Capability Coverage</h2></div>
        <div class="card-body">
          <p style="font-size:0.72rem;color:var(--t2);margin-bottom:14px">
            Agents cover ${new Set(state.agents.flatMap(a=>a.caps)).size} of ${CAP_LABELS.length} capabilities on the network.
          </p>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${CAP_LABELS.map((lbl,i) => {
              const agents = state.agents.filter(a=>a.caps.includes(i));
              const count = agents.length;
              const pct = state.agents.length > 0 ? (count/state.agents.length)*100 : 0;
              return `<div>
                <div class="chart-bar-row" style="margin-bottom:4px">
                  <div class="chart-bar-label">${lbl}</div>
                  <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${CAP_COLORS[i]}"></div></div>
                  <div class="chart-bar-value" style="color:${CAP_COLORS[i]}">${count}</div>
                </div>
                ${count>0?`<div style="display:flex;gap:4px;padding-left:90px">${agents.map(a=>`<span class="pill" style="background:${CAP_BG[i]};color:${CAP_COLORS[i]};font-size:0.56rem">${a.name.split("-")[0]}</span>`).join("")}</div>`:""}
              </div>`;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function filteredAgents() {
  if (state.agentFilter === -1) return state.agents;
  return state.agents.filter(a => a.caps.includes(state.agentFilter));
}

function setAgentFilter(cap) {
  state.agentFilter = cap;
  renderAgents(document.getElementById("content"));
}

function agentCardHTML(ag) {
  const primary = ag.caps[0] ?? 0;
  const color = CAP_COLORS[primary];
  const bg    = CAP_BG[primary];
  const repPct = (ag.rep / 1000) * 100;
  return `
  <div class="agent-card" onclick="openAgentModal(state.agents.find(a=>a.id==='${ag.id}'))">
    <div class="agent-avatar" style="background:${bg};color:${color}">${AGENT_EMOJIS[primary]}</div>
    <div>
      <div class="agent-name">${ag.name}</div>
      <div class="agent-role">${ag.caps.map(c=>CAP_LABELS[c]).join(" · ")}</div>
    </div>
    <div class="cap-chips">
      ${ag.caps.map(c=>`<span class="cap-chip" style="color:${CAP_COLORS[c]};background:${CAP_BG[c]};border-color:${CAP_COLORS[c]}40">${CAP_LABELS[c]}</span>`).join("")}
    </div>
    <div style="width:100%">
      <div style="display:flex;justify-content:space-between;font-size:0.66rem;color:var(--t2);margin-bottom:4px">
        <span>Reputation</span><span style="font-weight:700;color:${color}">${ag.rep}/1000</span>
      </div>
      <div class="rep-bar"><div class="rep-fill" style="width:${repPct}%;background:${color}"></div></div>
    </div>
    <div class="agent-stats">
      <div class="agent-stat">
        <div class="agent-stat-val">${ag.tasks}</div>
        <div class="agent-stat-lbl">Tasks</div>
      </div>
      <div class="agent-stat">
        <div class="agent-stat-val" style="color:var(--cyan)">${ag.earnings.toFixed(3)}</div>
        <div class="agent-stat-lbl">STT Earned</div>
      </div>
    </div>
  </div>`;
}

// ── TASKS view ─────────────────────────────────────────────────────────────────
function renderTasks(root) {
  root.innerHTML = `
  <div class="view">
    <div class="two-col" style="align-items:start">
      <!-- Left: marketplace -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="page-header" style="margin-bottom:0">
          <h1>Task Marketplace</h1>
          <p>Open tasks awaiting autonomous agent execution</p>
        </div>

        <div class="filter-tabs" id="task-filter-tabs">
          ${["all","open","active","done"].map(f=>`
            <button class="filter-tab ${state.taskFilter===f?"active":""}"
              onclick="setTaskFilter('${f}')">${{all:"All",open:"Open",active:"Active",done:"Completed"}[f]}
              <span style="margin-left:4px;opacity:.7">${taskCount(f)}</span>
            </button>`).join("")}
        </div>

        <div class="task-list" id="full-task-list">
          ${filteredTasks().map(taskItemHTML).join("")}
        </div>
      </div>

      <!-- Right: post task -->
      <div style="display:flex;flex-direction:column;gap:14px;position:sticky;top:70px">
        <div class="card">
          <div class="card-header">
            <h2>➕ Post New Task</h2>
            <span style="font-size:0.62rem;color:${state.wallet?"var(--green)":"var(--yellow)"}">${state.wallet?"● Wallet connected":"● No wallet"}</span>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Task Title</label>
              <input class="form-input" id="f-title" placeholder="e.g. Research Somnia DeFi TVL" />
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-textarea" id="f-desc" placeholder="Detailed requirements..." style="min-height:60px"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Required Capability</label>
              <select class="form-select" id="f-cap">
                ${CAP_LABELS.map((l,i)=>`<option value="${i}">${AGENT_EMOJIS[i]} ${l}</option>`).join("")}
              </select>
            </div>
            <div class="two-col" style="gap:10px">
              <div class="form-group">
                <label class="form-label">Reward (STT)</label>
                <input class="form-input" id="f-reward" type="number" value="0.01" min="0.001" step="0.001"/>
              </div>
              <div class="form-group">
                <label class="form-label">Deadline (min)</label>
                <input class="form-input" id="f-deadline" type="number" value="30" min="5"/>
              </div>
            </div>

            <!-- Primary: on-chain -->
            <button class="btn btn-primary btn-full" id="post-btn" onclick="postTask()" style="margin-bottom:8px">
              ⬡ Post on Somnia Chain
            </button>

            <!-- Secondary: demo mode -->
            <button class="btn btn-full" onclick="postTaskDemo()"
              style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:var(--yellow);font-size:0.72rem;padding:8px;letter-spacing:0.06em;text-transform:uppercase;border-radius:var(--r-sm);cursor:pointer;transition:opacity .15s">
              ▶ Demo Post (No Wallet Required)
            </button>

            <div id="post-status" style="margin-top:10px;line-height:1.4"></div>
          </div>
        </div>

        <!-- Quick-fill templates -->
        <div class="card">
          <div class="card-header"><h2>⚡ Quick Templates</h2></div>
          <div class="card-body" style="padding:8px 12px;display:flex;flex-direction:column;gap:6px">
            ${[
              ["Research Somnia DeFi TVL trends", 0, 0.008],
              ["Build a Python price feed aggregator", 1, 0.012],
              ["Analyse on-chain agent activity", 2, 0.006],
              ["Verify latest agent result quality", 3, 0.004],
            ].map(([t,c,r]) => `
              <button onclick="fillTemplate(${JSON.stringify(t)},${c},${r})"
                style="display:flex;align-items:center;gap:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm);padding:7px 10px;cursor:pointer;width:100%;text-align:left;transition:border-color .15s"
                onmouseover="this.style.borderColor='var(--indigo)'" onmouseout="this.style.borderColor='var(--border)'">
                <span style="font-size:0.9rem">${AGENT_EMOJIS[c]}</span>
                <div>
                  <div style="font-size:0.72rem;color:var(--t1)">${t}</div>
                  <div style="font-size:0.6rem;color:var(--t3)">${CAP_LABELS[c]} · ${r} STT</div>
                </div>
              </button>`).join("")}
          </div>
        </div>
      </div>
    </div>
  </div>`;
  bindTaskClicks(root);
}

function taskCount(filter) {
  if (filter === "all")    return state.tasks.length;
  if (filter === "open")   return state.tasks.filter(t=>t.status===0).length;
  if (filter === "active") return state.tasks.filter(t=>t.status>0&&t.status<4).length;
  if (filter === "done")   return state.tasks.filter(t=>t.status===4||t.status===5).length;
  return 0;
}

function filteredTasks() {
  const f = state.taskFilter;
  if (f==="all")    return state.tasks;
  if (f==="open")   return state.tasks.filter(t=>t.status===0);
  if (f==="active") return state.tasks.filter(t=>t.status>0&&t.status<4);
  if (f==="done")   return state.tasks.filter(t=>t.status===4||t.status===5);
  return state.tasks;
}

function setTaskFilter(f) {
  state.taskFilter = f;
  renderTasks(document.getElementById("content"));
}

function taskItemHTML(t) {
  const statusLabel = STATUS_LABELS[t.status] || "Unknown";
  const statusCls   = STATUS_CLS[t.status]   || "s-open";
  const dotCls      = DOT_CLS[t.status]      || "dot-open";
  const capColor    = CAP_COLORS[t.cap] || "#fff";
  return `
  <div class="task-item" data-taskid="${t.id}">
    <div class="task-status-dot ${dotCls}"></div>
    <div class="task-body">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">
        <span style="color:${capColor}">${CAP_LABELS[t.cap]||"?"}</span>
        <span>👥 ${t.bidders} bid${t.bidders!==1?"s":""}</span>
        ${t.quality>0?`<span style="color:var(--green)">★ ${t.quality}/100</span>`:""}
        <span>${timeAgo(t.created)}</span>
      </div>
    </div>
    <span class="task-reward">${t.reward.toFixed(3)} STT</span>
    <span class="task-badge ${statusCls}">${statusLabel}</span>
  </div>`;
}

// ── PIPELINE view ──────────────────────────────────────────────────────────────
const PL_SUBTASKS = [
  { cap:0, title:"Research Somnia DeFi protocols",  agent:"Researcher-1", reward:"0.006", score:86, tx:"0x3f1a...b2c9" },
  { cap:1, title:"Build TVL fetcher in Python",     agent:"Coder-1",      reward:"0.008", score:91, tx:"0x7e2d...4a1f" },
  { cap:2, title:"Analyse yield opportunities",     agent:"Analyst-1",    reward:"0.004", score:82, tx:"0xc9b3...80e6" },
];

function renderPipeline(root) {
  const s = state.pipelineStep;
  root.innerHTML = `
  <div class="view">
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
      <div>
        <h1>Agent Pipeline — Task Decomposition</h1>
        <p>OrchestratorAgent autonomously decomposes tasks into parallel sub-tasks on Somnia</p>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-primary" id="run-pipeline-btn" onclick="runDemoPipeline()" ${s>0&&s<6||state.pipelineRunning?"disabled":""}>
          ${state.pipelineRunning?"⏳ Running...":"▶ Run Demo Pipeline"}
        </button>
        <button class="btn btn-secondary" onclick="resetPipeline()">↺ Reset</button>
      </div>
    </div>

    <div class="two-col" style="align-items:start;gap:18px">
      <!-- LEFT: Task flow DAG -->
      <div style="display:flex;flex-direction:column;gap:12px">

        <!-- Master Task Card -->
        <div class="pipeline-task-card ${s>=1?'':'hidden'}" id="pl-task-card" style="${s>=1?'':'opacity:0;transform:translateY(10px)'}">
          <div class="ptc-label">⬡ Master Task · Block #4,812,341</div>
          <div class="ptc-title">Summarise Somnia DeFi Ecosystem — Comprehensive Report</div>
          <div class="ptc-meta">
            <span class="pill" style="background:rgba(236,72,153,.12);color:var(--pink)">Orchestration</span>
            <span>Reward: <strong style="color:var(--cyan)">0.020 STT</strong></span>
            <span>Escrowed in AgentVault</span>
            <span style="font-family:var(--font-mono);font-size:0.62rem;color:var(--t3)">0xa1f2...c834</span>
          </div>
        </div>

        <!-- Orchestrator node -->
        <div class="card">
          <div class="card-body" style="padding:14px">
            <div style="display:flex;justify-content:center">
              <div class="pipeline-node" style="max-width:200px">
                <div class="pipeline-node-box ${s>=1?'active':''} ${s>=3?'completed':''}" id="pl-orch">
                  <div class="pipeline-node-icon">🎯</div>
                  <div class="pipeline-node-name">Orchestrator-1</div>
                  <div class="pipeline-node-sub">${s>=3?'✓ Decomposed into 3 sub-tasks':'Task decomposition · Claude-powered'}</div>
                  ${s>=2&&s<3?'<div class="pipeline-node-sub" style="color:var(--indigo);margin-top:4px">Calling claude-sonnet-4-6...</div>':''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Arrow down -->
        <div class="pipeline-arrow">
          <div class="pipeline-arrow-line ${s>=2?'flowing':''}" id="pl-line1"></div>
          <div class="pipeline-arrow-head ${s>=2?'active':''}" id="pl-head1"></div>
        </div>

        <!-- Sub-task Cards Row -->
        <div class="pipeline-subtasks-row" id="pl-spec-row">
          ${PL_SUBTASKS.map((t,i) => `
          <div class="subtask-dag-card ${s>=3?'revealed':''} ${s>=4?'done':''} ${s>=3&&s<4?'active':''}" id="pl-n${i+1}">
            <div class="sdc-badge" style="background:${CAP_BG[t.cap]};color:${CAP_COLORS[t.cap]}">${CAP_LABELS[t.cap]}</div>
            <div class="sdc-title">${t.title}</div>
            <div class="sdc-agent">${AGENT_EMOJIS[t.cap]} ${t.agent}</div>
            <div class="sdc-reward">${t.reward} STT</div>
            ${s>=4?`<div class="sdc-score">⭐ Score: ${t.score}/100</div>`:'<div class="sdc-score" style="color:var(--t3)">${s>=3?"Executing...":""}</div>'}
            <div class="sdc-tx">tx: ${t.tx}</div>
          </div>`).join("")}
        </div>

        <!-- Arrow down -->
        <div class="pipeline-arrow">
          <div class="pipeline-arrow-line ${s>=4?'flowing':''}" id="pl-line2"></div>
          <div class="pipeline-arrow-head ${s>=4?'active':''}" id="pl-head2"></div>
        </div>

        <!-- Verifier node -->
        <div class="card">
          <div class="card-body" style="padding:14px">
            <div style="display:flex;justify-content:center">
              <div class="pipeline-node" style="max-width:200px">
                <div class="pipeline-node-box ${s>=5?'active':''} ${s>=6?'completed':''}" id="pl-ver">
                  <div class="pipeline-node-icon">🛡️</div>
                  <div class="pipeline-node-name">Verifier-1</div>
                  <div class="pipeline-node-sub">${s>=6?'✓ All 3 results scored':'AI quality scoring · claude-sonnet-4-6'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Arrow down -->
        <div class="pipeline-arrow">
          <div class="pipeline-arrow-line ${s>=6?'flowing':''}" id="pl-line3"></div>
          <div class="pipeline-arrow-head ${s>=6?'active':''}" id="pl-head3"></div>
        </div>

        <!-- Payment split viz -->
        <div class="card payment-split-viz ${s>=6?'revealed':''}" id="pl-pay">
          <div class="card-header">
            <h2>💎 Payment Released — AgentVault</h2>
            ${s>=6?'<span class="pill" style="background:rgba(34,197,94,.12);color:var(--green)">Atomic on Somnia</span>':''}
          </div>
          <div class="card-body">
            ${plPayRow("Specialists (85%)", "var(--cyan)",   85, "0.017 STT")}
            ${plPayRow("Verifier-1 (10%)",  "var(--purple)", 10, "0.002 STT")}
            ${plPayRow("Protocol fee (5%)", "var(--yellow)",  5, "0.001 STT")}
            <div style="font-size:0.66rem;color:var(--t3);margin-top:8px">
              All splits executed atomically · Block #4,812,352 · 3 tx
            </div>
          </div>
        </div>

        <!-- On-chain stats -->
        <div class="card">
          <div class="card-header"><h2>⬡ Somnia Chain Stats</h2></div>
          <div class="card-body">
            <div class="grid-2">
              ${chainStat("TPS Capacity","1,000,000+","var(--cyan)")}
              ${chainStat("Finality","< 1 second","var(--green)")}
              ${chainStat("Chain ID","50312 (testnet)","var(--indigo)")}
              ${chainStat("Token","STT","var(--yellow)")}
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT: Execution log -->
      <div class="card" style="position:sticky;top:70px">
        <div class="card-header">
          <h2>📜 Execution Log</h2>
          <span style="font-size:0.68rem;color:var(--t2)">Step ${s}/6 ${s===6?'· ✅ Complete':''}</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="subtask-output" id="pipeline-log" style="height:560px;border-radius:0 0 var(--r-lg) var(--r-lg);border:none">
${state.pipelineLog.length===0
  ? '<span style="color:var(--t3)">Click "Run Demo Pipeline" to start...\n\nThis simulates the full on-chain lifecycle:\n  1. User posts task → escrowed in AgentVault\n  2. Orchestrator bids, gets assigned\n  3. Claude decomposes into 3 sub-tasks\n  4. Sub-tasks posted on Somnia chain\n  5. Researcher, Coder, Analyst execute in parallel\n  6. Verifier scores with Claude (on-chain)\n  7. AgentVault releases payment: 85/10/5 split\n\n0 human actions required.</span>'
  : state.pipelineLog.join("\n")}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function plPayRow(label, color, pct, amount) {
  return `<div class="psv-row">
    <div class="psv-label">${label}</div>
    <div class="psv-track"><div class="psv-fill" style="width:${pct}%;background:${color}"></div></div>
    <div class="psv-val" style="color:${color}">${amount}</div>
  </div>`;
}

function chainStat(label, val, color) {
  return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px;text-align:center">
    <div style="font-size:1rem;font-weight:700;color:${color};margin-bottom:3px">${val}</div>
    <div style="font-size:0.66rem;color:var(--t2)">${label}</div>
  </div>`;
}

// Pipeline simulation
const PIPELINE_STEPS = [
  { delay:0,    log:['<span class="token-key">// Step 1: User posts complex task</span>', '> Task posted to TaskMarket.sol', '> Reward: 0.020 STT escrowed in AgentVault', '> Block #4812341 confirmed (<1s)', '> TaskPosted event emitted on Somnia'] },
  { delay:1800, log:['<span class="token-key">// Step 2: Orchestrator wakes up (reactive)</span>', '> Orchestrator-1 received TaskPosted event', '> Capability match: Orchestration ✓', '> submitBid() → tx confirmed', '> assignTask() → Orchestrator-1 assigned'] },
  { delay:3200, log:['<span class="token-key">// Step 3: Claude decomposes task</span>', '> Calling claude-sonnet-4-6 API...', '> Decomposition result:', '{', '  <span class="token-key">"subtasks"</span>: [', '    { <span class="token-key">"title"</span>: <span class="token-str">"Research Somnia DeFi protocols"</span>,', '      <span class="token-key">"capability"</span>: <span class="token-num">0</span>, <span class="token-key">"reward"</span>: <span class="token-str">"0.006 STT"</span> },', '    { <span class="token-key">"title"</span>: <span class="token-str">"Build TVL fetcher in Python"</span>,', '      <span class="token-key">"capability"</span>: <span class="token-num">1</span>, <span class="token-key">"reward"</span>: <span class="token-str">"0.008 STT"</span> },', '    { <span class="token-key">"title"</span>: <span class="token-str">"Analyse yield opportunities"</span>,', '      <span class="token-key">"capability"</span>: <span class="token-num">2</span>, <span class="token-key">"reward"</span>: <span class="token-str">"0.004 STT"</span> }', '  ]', '}', '> 3 sub-tasks posted on Somnia (txs #4812342–44)'] },
  { delay:5500, log:['<span class="token-key">// Step 4: Specialists execute in parallel</span>', '> Researcher-1 → bid → assigned → executing...', '> Coder-1 → bid → assigned → executing...', '> Analyst-1 → bid → assigned → executing...', '> [claude-sonnet-4-6 inference × 3 agents]', '> Researcher: submitResult() #4812345', '> Coder:      submitResult() #4812346', '> Analyst:    submitResult() #4812347', '> All 3 results on-chain ✓'] },
  { delay:8000, log:['<span class="token-key">// Step 5: Verifier scores with AI</span>', '> Verifier-1 scanning PendingVerification tasks...', '> Scoring Researcher output...', '  <span class="token-key">score</span>: <span class="token-num">86</span>/100 ✓  verifyAndPay() called', '> Scoring Coder output...', '  <span class="token-key">score</span>: <span class="token-num">91</span>/100 ✓  verifyAndPay() called', '> Scoring Analyst output...', '  <span class="token-key">score</span>: <span class="token-num">82</span>/100 ✓  verifyAndPay() called'] },
  { delay:10000, log:['<span class="token-key">// Step 6: Payments released atomically</span>', '> AgentVault.releaseFunds()', '  Researcher-1 ← 0.0051 STT (85%)', '  Verifier-1  ← 0.0006 STT (10%)', '  Protocol    ← 0.0003 STT (5%)', '  [× 3 sub-tasks, all atomic]', '> Orchestrator synthesizes final report...', '> Final result submitted on-chain ✓', '> Reputation updated: all agents ↑10 pts', '', '<span style="color:var(--green)">✅ Pipeline complete. 0 human actions required.</span>'] },
];

async function runDemoPipeline() {
  if (state.pipelineRunning) return;
  state.pipelineRunning = true;
  state.pipelineStep = 0;
  state.pipelineLog = [];
  renderPipeline(document.getElementById("content"));

  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    await sleep(i === 0 ? 0 : PIPELINE_STEPS[i].delay - PIPELINE_STEPS[i-1].delay);
    state.pipelineStep = i + 1;
    state.pipelineLog.push(...PIPELINE_STEPS[i].log, "");
    updatePipelineUI();
    toast("info", `Step ${i+1}/6`, PIPELINE_STEPS[i].log[0].replace(/<[^>]+>/g,"").replace("// ",""));
  }

  state.pipelineRunning = false;
  addEvent("success","⬡","Pipeline complete","6-step autonomous pipeline · 0 human actions required");
}

function updatePipelineUI() {
  const s = state.pipelineStep;

  // Execution log
  const logEl = document.getElementById("pipeline-log");
  if (logEl) { logEl.innerHTML = state.pipelineLog.join("\n"); logEl.scrollTop = logEl.scrollHeight; }

  // Step counter + button
  const btn = document.getElementById("run-pipeline-btn");
  if (btn) { btn.disabled = state.pipelineRunning; btn.textContent = state.pipelineRunning ? "⏳ Running..." : "▶ Run Demo Pipeline"; }

  // Master task card
  const taskCard = document.getElementById("pl-task-card");
  if (taskCard) {
    if (s >= 1) { taskCard.classList.remove("hidden"); taskCard.style.opacity="1"; taskCard.style.transform="translateY(0)"; taskCard.style.transition="opacity .4s,transform .4s"; }
  }

  // Orchestrator node box
  const orch = document.getElementById("pl-orch");
  if (orch) {
    orch.classList.toggle("active",    s >= 1 && s < 3);
    orch.classList.toggle("completed", s >= 3);
    const sub = orch.querySelector(".pipeline-node-sub");
    if (sub) sub.textContent = s >= 3 ? "✓ Decomposed into 3 sub-tasks" : s >= 2 ? "Calling claude-sonnet-4-6..." : "Task decomposition · Claude-powered";
  }

  // Arrow lines/heads
  [["pl-line1","pl-head1", 2], ["pl-line2","pl-head2", 4], ["pl-line3","pl-head3", 6]].forEach(([lid, hid, from]) => {
    const l = document.getElementById(lid), h = document.getElementById(hid);
    if (l) l.classList.toggle("flowing", s >= from);
    if (h) h.classList.toggle("active",  s >= from);
  });

  // Subtask DAG cards
  [1,2,3].forEach(i => {
    const el = document.getElementById(`pl-n${i}`);
    if (!el) return;
    el.classList.toggle("revealed", s >= 3);
    el.classList.toggle("active",   s >= 3 && s < 4);
    el.classList.toggle("done",     s >= 4);
    const scoreEl = el.querySelector(".sdc-score");
    if (scoreEl) {
      if (s >= 4) { scoreEl.style.color = "var(--green)"; scoreEl.textContent = `⭐ Score: ${PL_SUBTASKS[i-1].score}/100`; }
      else if (s >= 3) { scoreEl.style.color = "var(--t3)"; scoreEl.textContent = "Executing..."; }
      else { scoreEl.textContent = ""; }
    }
  });

  // Verifier node box
  const ver = document.getElementById("pl-ver");
  if (ver) {
    ver.classList.toggle("active",    s >= 5 && s < 6);
    ver.classList.toggle("completed", s >= 6);
    const sub = ver.querySelector(".pipeline-node-sub");
    if (sub) sub.textContent = s >= 6 ? "✓ All 3 results scored" : "AI quality scoring · claude-sonnet-4-6";
  }

  // Payment split card
  const pay = document.getElementById("pl-pay");
  if (pay) pay.classList.toggle("revealed", s >= 6);
}

function resetPipeline() {
  state.pipelineRunning = false;
  state.pipelineStep = 0;
  state.pipelineLog = [];
  renderPipeline(document.getElementById("content"));
}

// ── ANALYTICS view ─────────────────────────────────────────────────────────────
function renderAnalytics(root) {
  const avgQ = state.metrics.qualityCount > 0
    ? Math.round(state.metrics.qualitySum / state.metrics.qualityCount) : 0;
  const successRate = state.metrics.total > 0
    ? Math.round((state.metrics.completed / state.metrics.total) * 100) : 0;

  const hourlyData = [
    {h:"00", tasks:3}, {h:"02", tasks:5}, {h:"04", tasks:2}, {h:"06", tasks:7},
    {h:"08", tasks:12},{h:"10", tasks:18},{h:"12", tasks:22},{h:"14", tasks:19},
    {h:"16", tasks:25},{h:"18", tasks:20},{h:"20", tasks:14},{h:"22", tasks:8},
  ];
  const maxTasks = Math.max(...hourlyData.map(d=>d.tasks));

  root.innerHTML = `
  <div class="view">
    <div class="page-header">
      <h1>Analytics</h1>
      <p>Performance metrics for the AuraAgentic autonomous agent network</p>
    </div>

    <!-- Top metrics -->
    <div class="grid-4" style="margin-bottom:18px">
      ${statCard("Success Rate",     successRate+"%",              "✅","c-green",  "up",  "Last 24h")}
      ${statCard("Avg Quality Score",avgQ+"/100",                  "⭐","c-purple", "up",  "AI Scored")}
      ${statCard("Total STT Moved",  state.metrics.sttOut.toFixed(4)+" STT","💎","c-cyan","up","On-chain")}
      ${statCard("Agents On-chain",  state.agents.length,          "🤖","c-indigo","live","Active")}
    </div>

    <div class="two-col" style="margin-bottom:16px;align-items:start">
      <!-- Hourly task volume chart -->
      <div class="card">
        <div class="card-header"><h2>📈 Task Volume (24h)</h2></div>
        <div class="card-body">
          <div style="display:flex;align-items:flex-end;gap:6px;height:120px;margin-bottom:6px">
            ${hourlyData.map(d => `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%">
                <div style="flex:1;width:100%;display:flex;align-items:flex-end">
                  <div style="width:100%;height:${(d.tasks/maxTasks)*100}%;background:linear-gradient(180deg,var(--indigo),var(--purple));border-radius:3px 3px 0 0;min-height:3px;transition:height .6s ease"></div>
                </div>
                <div style="font-size:0.54rem;color:var(--t3)">${d.h}</div>
              </div>`).join("")}
          </div>
          <div style="text-align:center;font-size:0.68rem;color:var(--t2)">Hour of day (UTC) — Demo simulation data</div>
        </div>
      </div>

      <!-- Quality distribution + scores rings -->
      <div class="card">
        <div class="card-header"><h2>🎯 Quality Distribution</h2></div>
        <div class="card-body">
          <div style="display:flex;justify-content:space-around;margin-bottom:16px">
            ${scoreRing(avgQ,  "Avg Score",    "var(--indigo)")}
            ${scoreRing(successRate, "Success %","var(--green)")}
            ${scoreRing(state.metrics.disputed > 0 ? Math.round((state.metrics.disputed/state.metrics.total)*100) : 0, "Disputed %","var(--red)")}
          </div>
          <div class="divider"></div>
          ${[["90-100","Exceptional",state.tasks.filter(t=>t.quality>=90).length,"var(--green)"],
             ["75-89", "Good",       state.tasks.filter(t=>t.quality>=75&&t.quality<90).length,"var(--cyan)"],
             ["60-74", "Acceptable", state.tasks.filter(t=>t.quality>=60&&t.quality<75).length,"var(--yellow)"],
             ["< 60",  "Poor/Fail",  state.tasks.filter(t=>t.quality>0&&t.quality<60).length, "var(--red)"]
            ].map(([range, label, count, color]) => `
            <div class="chart-bar-row">
              <div class="chart-bar-label">${range}</div>
              <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width:${state.tasks.length>0?(count/state.tasks.length)*100:0}%;background:${color}"></div>
              </div>
              <div class="chart-bar-value" style="color:${color}">${count}</div>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <!-- Agent leaderboard + timeline -->
    <div class="two-col" style="align-items:start">
      <!-- Agent leaderboard -->
      <div class="card">
        <div class="card-header"><h2>🏆 Agent Leaderboard</h2></div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:0">
            ${state.agents.sort((a,b)=>b.rep-a.rep).map((ag,i) => {
              const color = CAP_COLORS[ag.caps[0]??0];
              const pct = (ag.rep/1000)*100;
              return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
                <div style="font-size:1rem;width:22px;text-align:center">${["🥇","🥈","🥉","4","5"][i]}</div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span style="font-size:0.78rem;font-weight:600">${ag.name}</span>
                    <span style="font-size:0.72rem;font-weight:700;color:${color}">${ag.rep} rep</span>
                  </div>
                  <div class="rep-bar"><div class="rep-fill" style="width:${pct}%;background:${color}"></div></div>
                  <div style="display:flex;gap:12px;margin-top:4px;font-size:0.64rem;color:var(--t2)">
                    <span>${ag.tasks} tasks</span>
                    <span>${ag.earnings.toFixed(3)} STT earned</span>
                  </div>
                </div>
              </div>`;
            }).join("")}
          </div>
        </div>
      </div>

      <!-- Recent timeline -->
      <div class="card">
        <div class="card-header"><h2>📅 Event Timeline</h2></div>
        <div class="card-body" style="padding:14px 16px">
          <div class="timeline">
            ${state.events.slice(0,8).map((ev,i) => `
              <div class="tl-item">
                <div class="tl-line">
                  <div class="tl-dot" style="background:${{info:"var(--indigo)",success:"var(--green)",warn:"var(--yellow)",error:"var(--red)"}[ev.type]||"var(--border)"}"></div>
                  ${i < state.events.slice(0,8).length-1 ? '<div class="tl-connector"></div>' : ""}
                </div>
                <div class="tl-body">
                  <div class="tl-title">${ev.icon} ${esc(ev.title)}</div>
                  <div class="tl-time">${ev.time}</div>
                  ${ev.desc?`<div class="tl-desc">${esc(ev.desc)}</div>`:""}
                </div>
              </div>`).join("")}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function scoreRing(val, label, color) {
  const r = 34, circ = 2*Math.PI*r;
  const dash = (val/100)*circ;
  return `<div class="score-ring-wrap">
    <div class="score-ring">
      <svg viewBox="0 0 80 80" width="80" height="80">
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--border)" stroke-width="6"/>
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="${color}" stroke-width="6"
          stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
      </svg>
      <div class="score-ring-val" style="color:${color}">${val}</div>
    </div>
    <div class="score-ring-label">${label}</div>
  </div>`;
}

// ── Activity feed ─────────────────────────────────────────────────────────────
function renderActivityFeed() {
  const el = document.getElementById("activity-feed");
  if (!el) return;
  el.innerHTML = state.events.slice(0,12).map(activityItemHTML).join("");
}

function activityItemHTML(ev) {
  const cls = {info:"ev-info",success:"ev-success",warn:"ev-warn",error:"ev-error"}[ev.type] || "ev-neutral";
  return `<div class="activity-item ${cls}">
    <span class="activity-icon">${ev.icon}</span>
    <div class="activity-text"><strong>${esc(ev.title)}</strong>${ev.desc?` — ${esc(ev.desc)}`:""}</div>
    <span class="activity-time">${ev.time}</span>
  </div>`;
}

// ── Modals ─────────────────────────────────────────────────────────────────────
// ── Task progress tracker modal ───────────────────────────────────────────────
let _modalPoll = null;

function openTaskModal(task) {
  _renderTaskTracker(task);
  showModal();

  // Live polling: refresh tracker every 3s while open
  clearInterval(_modalPoll);
  _modalPoll = setInterval(async () => {
    const overlay = document.getElementById("modal-overlay");
    if (!overlay || overlay.classList.contains("hidden")) { clearInterval(_modalPoll); return; }
    // Try to get fresh data from chain
    let fresh = state.tasks.find(t => t.id === task.id);
    if (fresh && !fresh.isDemo && state.wallet) {
      try {
        const provider = getReadProvider();
        const market   = new ethers.Contract(CONTRACT_MARKET, MARKET_ABI_FULL, provider);
        const raw      = await market.getTask(task.id);
        fresh = taskFromChain(raw);
        const idx = state.tasks.findIndex(t => t.id === task.id);
        if (idx >= 0) state.tasks[idx] = fresh;
        recomputeMetrics();
      } catch {}
    }
    if (fresh) { task = fresh; _renderTaskTracker(task); }
  }, 3000);
}

function _renderTaskTracker(task) {
  const cap   = task.cap ?? 0;
  const color = CAP_COLORS[cap];

  // 6 pipeline steps
  const STEPS = ["Posted","Bids Open","Assigned","Executing","Verifying","Complete"];
  const stepFor = s => s === 0 ? 1 : s === 1 ? 2 : s === 2 ? 2 : s === 3 ? 3 : s === 4 ? 5 : s >= 4 ? 5 : 1;
  const currentStep = stepFor(task.status);

  const stepHTML = STEPS.map((label, i) => {
    const done    = i < currentStep;
    const active  = i === currentStep;
    const disputed = task.status === 5 && i === 5;
    const bg = disputed ? "var(--red)" : done || active ? color : "var(--bg3)";
    const bc = disputed ? "var(--red)" : done || active ? color : "var(--border)";
    const tc = disputed ? "#fff"       : done || active ? "#fff"  : "var(--t3)";
    return `
      <div class="tracker-step">
        <div class="tracker-dot" style="background:${bg};border-color:${bc};color:${tc}">
          ${done ? "✓" : disputed && i === 5 ? "!" : i + 1}
        </div>
        <div class="tracker-step-label" style="color:${active?(disputed?"var(--red)":color):"var(--t3)"}">${label}</div>
      </div>
      ${i < STEPS.length - 1 ? `<div class="tracker-conn" style="background:${done?color:"var(--border)"}"></div>` : ""}
    `;
  }).join("");

  // Timeline events
  const tl = buildTaskTimeline(task);

  // Agent card
  const agentInfo = task.assigned ? (() => {
    const ag = state.agents.find(a => a.id?.toLowerCase() === task.assigned?.toLowerCase());
    if (!ag) return `<div class="val mono" style="font-size:0.7rem">${task.assigned.slice(0,10)}…${task.assigned.slice(-4)}</div>`;
    return `<div style="display:flex;align-items:center;gap:10px">
      <div style="width:36px;height:36px;border-radius:50%;background:${CAP_BG[ag.caps[0]??0]};color:${CAP_COLORS[ag.caps[0]??0]};display:flex;align-items:center;justify-content:center;font-size:1rem">${AGENT_EMOJIS[ag.caps[0]??0]}</div>
      <div>
        <div style="font-size:0.82rem;font-weight:600">${ag.name}</div>
        <div style="font-size:0.65rem;color:var(--t2)">Rep ${ag.rep} · ${ag.tasks} tasks completed</div>
      </div>
    </div>`;
  })() : `<div style="color:var(--t3);font-size:0.75rem">Awaiting bids…</div>`;

  // Quality
  const qualityHTML = task.quality > 0 ? `
    <div class="modal-section">
      <label>Quality Score</label>
      <div class="quality-display">
        <div class="quality-bar-wrap"><div class="quality-bar-fill" style="width:${task.quality}%"></div></div>
        <div class="quality-val" style="color:${task.quality>=75?"var(--green)":task.quality>=60?"var(--yellow)":"var(--red)"}">${task.quality}/100</div>
      </div>
    </div>` : "";

  // Result
  const resultHTML = task.resultHash ? `
    <div class="modal-section">
      <label>Result ${task.status >= 4 ? "✅ Verified" : "⏳ Pending Verification"}</label>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;font-size:0.72rem;color:var(--t1);max-height:180px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;font-family:var(--font-mono)">${esc(parseResult(task.resultHash))}</div>
    </div>` : (task.status >= 2 ? `
    <div class="modal-section">
      <label>Result</label>
      <div style="color:var(--t3);font-size:0.72rem;display:flex;align-items:center;gap:6px">
        <span class="demo-dot" style="display:inline-block"></span> Agent executing — result pending…
      </div>
    </div>` : "");

  // Demo badge
  const demoBadge = task.isDemo ? `<span style="background:rgba(245,158,11,0.15);color:var(--yellow);font-size:0.6rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:2px 8px;border-radius:10px;margin-left:8px">DEMO</span>` : "";

  document.getElementById("modal-content").innerHTML = `
    <!-- Header -->
    <div style="padding-right:28px;margin-bottom:16px">
      <div style="font-size:0.62rem;color:var(--t3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px">Task #${task.id} ${demoBadge}</div>
      <h2 style="font-size:1rem;font-weight:600;line-height:1.4">${esc(task.title)}</h2>
    </div>

    <!-- Progress stepper -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px;margin-bottom:16px">
      <div style="font-size:0.6rem;color:var(--t3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px">Progress</div>
      <div class="tracker-row">${stepHTML}</div>
      <div style="text-align:center;margin-top:8px;font-size:0.68rem;font-weight:600;color:${task.status===5?"var(--red)":color}">${task.status===5?"⚠️ Disputed":STATUS_LABELS[task.status]}</div>
    </div>

    <!-- Key stats -->
    <div class="grid-4" style="margin-bottom:14px;gap:8px">
      <div style="background:var(--bg3);border-radius:var(--r-sm);padding:10px;text-align:center">
        <div style="font-size:0.88rem;font-weight:700;color:${color}">${CAP_LABELS[cap]}</div>
        <div style="font-size:0.58rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">Capability</div>
      </div>
      <div style="background:var(--bg3);border-radius:var(--r-sm);padding:10px;text-align:center">
        <div style="font-size:0.88rem;font-weight:700;color:var(--cyan)">${task.reward.toFixed(4)}</div>
        <div style="font-size:0.58rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">STT Reward</div>
      </div>
      <div style="background:var(--bg3);border-radius:var(--r-sm);padding:10px;text-align:center">
        <div style="font-size:0.88rem;font-weight:700;color:var(--indigo)">${task.bidders}</div>
        <div style="font-size:0.58rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">Bids</div>
      </div>
      <div style="background:var(--bg3);border-radius:var(--r-sm);padding:10px;text-align:center">
        <div style="font-size:0.88rem;font-weight:700;color:${task.quality>0?(task.quality>=75?"var(--green)":"var(--yellow)"):"var(--t3)"}">${task.quality>0?task.quality+"/100":"—"}</div>
        <div style="font-size:0.58rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">Quality</div>
      </div>
    </div>

    <!-- Assigned agent -->
    <div class="modal-section">
      <label>Assigned Agent</label>
      ${agentInfo}
    </div>

    ${qualityHTML}
    ${resultHTML}

    <!-- Timeline -->
    <div class="modal-section">
      <label>Timeline</label>
      <div class="tracker-timeline">${tl}</div>
    </div>

    <!-- Actions -->
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">
      <a href="${EXPLORER_TESTNET}address/${CONTRACT_MARKET}" target="_blank"
         style="font-size:0.72rem;color:var(--indigo);text-decoration:none;letter-spacing:0.02em">
        View on Explorer ↗
      </a>
      ${!task.isDemo ? `<a href="${EXPLORER_TESTNET}tx/" target="_blank"
         style="font-size:0.72rem;color:var(--t3);text-decoration:none">Tx History ↗</a>` : ""}
      <span style="flex:1"></span>
      <span style="font-size:0.65rem;color:var(--t3)">Auto-refreshes every 3s</span>
    </div>`;
}

function buildTaskTimeline(task) {
  const entries = [];
  const now = Math.floor(Date.now() / 1000);

  entries.push({ icon:"📋", text:`Task posted`, time: task.created, color:"var(--indigo)" });

  if (task.bidders > 0)
    entries.push({ icon:"🤝", text:`${task.bidders} bid${task.bidders!==1?"s":""} received`, time: task.created + 30, color:"var(--yellow)" });

  if (task.assigned) {
    const ag = state.agents.find(a => a.id?.toLowerCase() === task.assigned?.toLowerCase());
    const name = ag ? ag.name : task.assigned.slice(0,10)+"…";
    entries.push({ icon:"🤖", text:`Assigned to ${name}`, time: task.created + 60, color:"var(--cyan)" });
  }

  if (task.status >= 2)
    entries.push({ icon:"⚙️", text:"Agent executing task", time: task.created + 90, color:"var(--purple)", pulse: task.status === 2 });

  if (task.status >= 3)
    entries.push({ icon:"🔍", text:"Verifier scoring result", time: task.created + 150, color:"var(--yellow)", pulse: task.status === 3 });

  if (task.status === 4)
    entries.push({ icon:"✅", text:`Completed · quality ${task.quality}/100 · ${task.reward.toFixed(4)} STT paid`, time: now, color:"var(--green)" });

  if (task.status === 5)
    entries.push({ icon:"⚠️", text:"Task disputed", time: now, color:"var(--red)" });

  return entries.map((e, i) => `
    <div style="display:flex;gap:8px;align-items:flex-start;${i>0?"margin-top:10px":""}">
      <div style="width:22px;height:22px;border-radius:50%;background:${e.color}22;color:${e.color};display:flex;align-items:center;justify-content:center;font-size:0.7rem;flex-shrink:0;margin-top:1px${e.pulse?";animation:pulse 1.2s infinite":""}">
        ${e.icon}
      </div>
      <div style="flex:1">
        <div style="font-size:0.75rem;color:var(--t1)">${e.text}</div>
        <div style="font-size:0.62rem;color:var(--t3);margin-top:1px">${timeAgo(e.time)}</div>
      </div>
      ${i === entries.length - 1 && e.pulse ? `<span class="demo-dot" style="display:inline-block;flex-shrink:0;margin-top:6px"></span>` : ""}
    </div>
  `).join("")  || `<div style="color:var(--t3);font-size:0.72rem">No events yet</div>`;
}

function openAgentModal(ag) {
  if (!ag) return;
  const cap = ag.caps[0] ?? 0;
  const color = CAP_COLORS[cap];
  const repPct = (ag.rep/1000)*100;
  document.getElementById("modal-content").innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <div style="width:56px;height:56px;border-radius:50%;background:${CAP_BG[cap]};color:${color};display:flex;align-items:center;justify-content:center;font-size:1.5rem">${AGENT_EMOJIS[cap]}</div>
      <div>
        <div style="font-size:1.1rem;font-weight:700">${ag.name}</div>
        <div style="font-size:0.72rem;color:var(--t2)">${ag.caps.map(c=>CAP_LABELS[c]).join(" · ")}</div>
      </div>
    </div>
    <div class="two-col" style="margin-bottom:14px">
      <div style="background:var(--bg3);border-radius:var(--r-sm);padding:12px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:${color}">${ag.rep}</div>
        <div style="font-size:0.66rem;color:var(--t2)">Reputation</div>
      </div>
      <div style="background:var(--bg3);border-radius:var(--r-sm);padding:12px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:var(--cyan)">${ag.tasks}</div>
        <div style="font-size:0.66rem;color:var(--t2)">Tasks Completed</div>
      </div>
    </div>
    <div class="modal-section">
      <label>Reputation Progress</label>
      <div class="rep-bar" style="height:8px"><div class="rep-fill" style="width:${repPct}%;background:${color}"></div></div>
    </div>
    <div class="modal-section">
      <label>STT Earned</label>
      <div class="val" style="color:var(--cyan);font-weight:700">${ag.earnings.toFixed(4)} STT</div>
    </div>
    <div class="modal-section">
      <label>Wallet</label>
      <div class="val mono">${ag.id}</div>
    </div>
    <div class="modal-section">
      <label>Capabilities</label>
      <div class="val">${ag.caps.map(c=>`<span class="cap-chip" style="color:${CAP_COLORS[c]};background:${CAP_BG[c]};border-color:${CAP_COLORS[c]}40;margin-right:4px">${CAP_LABELS[c]}</span>`).join("")}</div>
    </div>`;
  showModal();
}

function showModal() {
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  clearInterval(_modalPoll);
  _modalPoll = null;
}

// ── Network guard — ensures MetaMask is on Somnia testnet before any TX ──────
async function ensureSomniaNetwork() {
  if (!window.ethereum) throw new Error("MetaMask is not installed");
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current === SOMNIA_CHAIN_ID) return;  // already correct
  setPostStatus("Switching to Somnia Testnet…", "var(--yellow)");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SOMNIA_CHAIN_ID }],
    });
  } catch (sw) {
    if (sw.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: SOMNIA_CHAIN_ID,
          chainName: "Somnia Testnet (Shannon)",
          nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
          rpcUrls: [SOMNIA_RPC],
          blockExplorerUrls: [EXPLORER_TESTNET],
        }],
      });
    } else throw sw;
  }
}

// ── Post task (on-chain via MetaMask) ─────────────────────────────────────────
async function postTask() {
  const title       = document.getElementById("f-title")?.value?.trim();
  const desc        = document.getElementById("f-desc")?.value?.trim() || title;
  const cap         = parseInt(document.getElementById("f-cap")?.value ?? "0");
  const reward      = parseFloat(document.getElementById("f-reward")?.value ?? "0.01");
  const deadlineMin = parseInt(document.getElementById("f-deadline")?.value ?? "30");

  if (!title) { setPostStatus("Enter a task title.", "var(--red)"); return; }

  if (!state.wallet) {
    setPostStatus("Wallet not connected — use Demo Post below, or connect MetaMask.", "var(--yellow)");
    return;
  }

  const btn = document.getElementById("post-btn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Signing…"; }

  try {
    // 1. Make sure we're on Somnia testnet
    await ensureSomniaNetwork();

    setPostStatus("Waiting for MetaMask signature…", "var(--indigo)");
    const signer   = await getWriteSigner();
    const market   = new ethers.Contract(CONTRACT_MARKET, MARKET_ABI_FULL, signer);
    const deadline = Math.floor(Date.now() / 1000) + deadlineMin * 60;
    const value    = ethers.parseEther(reward.toFixed(6));

    // 2. Send transaction
    const tx = await market.postTask(title, desc, "{}", cap, deadline, 1, { value });
    setPostStatus("Confirming on Somnia (<1s)…", "var(--cyan)");
    if (btn) btn.textContent = "⏳ Confirming…";

    // 3. Wait for receipt
    const receipt  = await tx.wait();
    const txHash   = receipt.hash;
    const shortHash = txHash.slice(0, 12) + "…";

    setPostStatus(`✅ On-chain! TX: <a href="${EXPLORER_TESTNET}tx/${txHash}" target="_blank" style="color:var(--cyan)">${shortHash}</a>`, "var(--green)");
    document.getElementById("post-status").innerHTML = document.getElementById("post-status").innerHTML; // flush
    toast("success", "Task Posted!", `${reward} STT escrowed · ${shortHash}`);
    addEvent("success", "📋", "Task posted on-chain", `${reward} STT · ${shortHash}`);

    // 4. Clear form and reload
    ["f-title","f-desc"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    await loadChainData();
  } catch (e) {
    const msg = e.reason || e.message || String(e);
    setPostStatus("❌ " + msg.slice(0, 100), "var(--red)");
    toast("error", "Transaction Failed", msg.slice(0, 80));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🚀 Post Task on Somnia"; }
  }
}

// ── Demo post (no wallet — runs simulation locally) ───────────────────────────
function postTaskDemo() {
  const title  = document.getElementById("f-title")?.value?.trim();
  const desc   = document.getElementById("f-desc")?.value?.trim() || title;
  const cap    = parseInt(document.getElementById("f-cap")?.value ?? "0");
  const reward = parseFloat(document.getElementById("f-reward")?.value ?? "0.01");

  if (!title) { setPostStatus("Enter a task title first.", "var(--red)"); return; }

  const now = Math.floor(Date.now() / 1000);
  const newId = (state.tasks.length > 0 ? Math.max(...state.tasks.map(t => t.id)) : 0) + 1;

  const demoTask = {
    id:         newId,
    title,
    cap,
    status:     0,
    reward,
    poster:     state.wallet || "0xDemo",
    assigned:   null,
    quality:    0,
    created:    now,
    bidders:    0,
    resultHash: "",
    inputData:  JSON.stringify({ demo: true }),
    isDemo:     true,
  };

  state.tasks.unshift(demoTask);
  recomputeMetrics();
  if (state.view === "tasks") render();

  setPostStatus(`✅ Demo task #${newId} live — agents bidding in 2s…`, "var(--green)");
  toast("info", "Demo Task Created", `#${newId}: ${title}`);
  addEvent("info", "📋", `Demo task #${newId}`, `${CAP_LABELS[cap]} · ${reward} STT`);

  // Auto-open the tracker for this task
  setTimeout(() => openTaskModal(demoTask), 400);

  // Run the simulation pipeline
  setTimeout(() => simulateBidAndAssign(newId), 1800);
}

function setPostStatus(msg, color) {
  const el = document.getElementById("post-status");
  if (!el) return;
  el.style.color = color;
  el.style.fontSize = "0.75rem";
  el.innerHTML = msg;
}

function fillTemplate(title, cap, reward) {
  const t = document.getElementById("f-title"); if (t) t.value = title;
  const c = document.getElementById("f-cap");   if (c) c.value = cap;
  const r = document.getElementById("f-reward"); if (r) r.value = reward;
  setPostStatus("Template loaded — click Post to submit.", "var(--cyan)");
}

// ── Demo simulation engine ─────────────────────────────────────────────────────
function simulateBidAndAssign(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || task.status !== 0) return;
  const matchingAgents = state.agents.filter(a => a.caps.includes(task.cap));
  if (!matchingAgents.length) return;

  task.bidders = Math.min(matchingAgents.length, 1 + Math.floor(Math.random()*2));
  task.status = 1;
  const agent = matchingAgents.sort((a,b)=>b.rep-a.rep)[0];
  task.assigned = agent.id;
  addEvent("info","🤝",`Task #${taskId} assigned`,`${agent.name} (rep ${agent.rep})`);
  if (state.view === "tasks") render();

  // Execute after 4–8s
  setTimeout(() => {
    task.status = 2;
    addEvent("warn","⚙️",`Task #${taskId} executing`, `${agent.name} is working...`);
    setTimeout(() => {
      task.status = 3;
      addEvent("warn","🔍",`Task #${taskId} pending verify`, "Verifier-1 scoring...");
      setTimeout(() => {
        const score = 65 + Math.floor(Math.random()*31);
        task.status = 4;
        task.quality = score;
        agent.tasks++;
        agent.earnings += task.reward * 0.85;
        recomputeMetrics();
        addEvent("success","✅",`Task #${taskId} completed`, `Score: ${score}/100 — ${task.reward.toFixed(3)} STT paid`);
        toast("success","Task Complete!",`Score ${score}/100 — ${task.reward.toFixed(3)} STT distributed`);
        if (state.view === "tasks" || state.view === "dashboard") render();
      }, 3000);
    }, 4000 + Math.random()*4000);
  }, 1500);
}

function autoSpawnTasks() {
  if (!state.demoMode) return;
  const topic = TASK_TOPICS[Math.floor(Math.random() * TASK_TOPICS.length)];
  const cap   = Math.floor(Math.random() * 5);
  const reward = 0.004 + Math.random() * 0.018;
  const t = {
    id: state.tasks.length + 1,
    title: topic, cap, status: 0, reward,
    poster: "0x" + Math.random().toString(16).slice(2,10),
    assigned: null, quality: 0,
    created: Math.floor(Date.now()/1000), bidders: 0,
  };
  state.tasks.unshift(t);
  recomputeMetrics();
  addEvent("info","📋",`Task #${t.id} posted`, `"${topic}" — ${reward.toFixed(3)} STT`);
  toast("info", "New Task!", `"${topic}" — ${reward.toFixed(3)} STT`);
  if (state.view === "dashboard" || state.view === "tasks") render();
  setTimeout(() => simulateBidAndAssign(t.id), 2000 + Math.random()*3000);
}

// ── Block counter ─────────────────────────────────────────────────────────────
function tickBlock() {
  state.blockNumber += 1 + Math.floor(Math.random()*3);
  const el = document.getElementById("block-num");
  if (el) el.textContent = state.blockNumber.toLocaleString();
}

// ── Badges ─────────────────────────────────────────────────────────────────────
function updateBadges() {
  const openTasks     = state.tasks.filter(t=>t.status===0).length;
  const sentinelCount = state.tasks.filter(isSentinelTask).length;
  const el1 = document.getElementById("badge-agents");
  const el2 = document.getElementById("badge-tasks");
  const el3 = document.getElementById("badge-sentinel");
  if (el1) el1.textContent = state.agents.length;
  if (el2) el2.textContent = openTasks;
  if (el3) { el3.textContent = sentinelCount; el3.style.display = sentinelCount > 0 ? "" : "none"; }
}

// ── Wallet ─────────────────────────────────────────────────────────────────────
const WC_PROJECT_ID = "5b3287538b8b8f55ba08cdd88b84e54c";

// ── Wallet modal ──────────────────────────────────────────────────────────────
function showWalletModal() {
  const overlay = document.getElementById("wallet-modal-overlay");
  if (overlay) overlay.classList.remove("hidden");
}

function closeWalletModal() {
  const overlay = document.getElementById("wallet-modal-overlay");
  if (overlay) overlay.classList.add("hidden");
}

// ── Connected / disconnected UI state ─────────────────────────────────────────
function setWalletConnected(address) {
  // Hide connect button
  const btn = document.getElementById("wallet-btn");
  if (btn) btn.classList.add("hidden");

  // Show wallet info pill
  const info = document.getElementById("wallet-info");
  if (info) {
    info.classList.remove("hidden");
    const addrEl = document.getElementById("wi-addr");
    if (addrEl) addrEl.textContent = `${address.slice(0,6)}…${address.slice(-4)}`;
    const balEl = document.getElementById("wi-bal");
    if (balEl) balEl.textContent = state.balance && state.balance !== "0" ? `${state.balance} STT` : "";
  }

  // Show disconnect button
  const disc = document.getElementById("disconnect-btn");
  if (disc) disc.classList.remove("hidden");
}

function setWalletDisconnected() {
  // Show connect button
  const btn = document.getElementById("wallet-btn");
  if (btn) btn.classList.remove("hidden");

  // Hide wallet info pill
  const info = document.getElementById("wallet-info");
  if (info) info.classList.add("hidden");

  // Hide disconnect button
  const disc = document.getElementById("disconnect-btn");
  if (disc) disc.classList.add("hidden");
}

function disconnectWallet() {
  state.wallet = null;
  state.balance = "0";
  setWalletDisconnected();
  const dot = document.getElementById("net-dot");
  if (dot) dot.classList.remove("connected");
  const label = document.getElementById("net-label");
  if (label) label.textContent = "Demo Mode";
  toast("info", "Wallet Disconnected", "Disconnected from Somnia Testnet");
  addEvent("info", "🔌", "Wallet disconnected", "");
}

// ── Shared post-connect handler ───────────────────────────────────────────────
async function _onWalletConnected(provider) {
  const ethersProvider = new ethers.BrowserProvider(provider);
  const accounts = await ethersProvider.listAccounts();
  state.wallet = accounts[0]?.address || accounts[0];

  try {
    const bal = await ethersProvider.getBalance(state.wallet);
    state.balance = parseFloat(ethers.formatEther(bal)).toFixed(4);
  } catch { state.balance = "0"; }

  setWalletConnected(state.wallet);
  closeWalletModal();

  const dot = document.getElementById("net-dot");
  if (dot) dot.classList.add("connected");
  const label = document.getElementById("net-label");
  if (label) label.textContent = "Somnia Testnet";

  toast("success", "Wallet Connected", `${state.wallet.slice(0,10)}… · ${state.balance} STT`);
  addEvent("success","🔗","Wallet connected", `${state.wallet.slice(0,10)}… · ${state.balance} STT`);
  loadChainData();
}

// ── MetaMask ──────────────────────────────────────────────────────────────────
async function connectMetaMask() {
  if (!window.ethereum) {
    toast("warn","No MetaMask","Install the MetaMask browser extension to continue");
    return;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    try {
      await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{chainId:SOMNIA_CHAIN_ID}] });
    } catch(sw) {
      if (sw.code===4902) {
        await window.ethereum.request({ method:"wallet_addEthereumChain", params:[{
          chainId: SOMNIA_CHAIN_ID,
          chainName: "Somnia Testnet (Shannon)",
          nativeCurrency: {name:"STT",symbol:"STT",decimals:18},
          rpcUrls:[SOMNIA_RPC],
          blockExplorerUrls:[EXPLORER_TESTNET],
        }]});
      }
    }
    await _onWalletConnected(window.ethereum);
  } catch(e) {
    if (e.code !== 4001) toast("error","MetaMask Error", e.message?.slice(0,60));
  }
}

// ── WalletConnect ─────────────────────────────────────────────────────────────
async function connectWalletConnect() {
  if (!WC_PROJECT_ID) {
    toast("warn","WalletConnect","Add your WC_PROJECT_ID in app.js (free at cloud.walletconnect.com)");
    return;
  }
  closeWalletModal();
  toast("info","WalletConnect","Loading QR modal…");

  try {
    // Dynamic load — keeps page startup fast
    if (!window.EthereumProvider) {
      await _loadScript("https://unpkg.com/@walletconnect/ethereum-provider@2.11.2/dist/index.umd.js");
    }
    const provider = await window.EthereumProvider.init({
      projectId: WC_PROJECT_ID,
      chains: [50312],
      showQrModal: true,
      qrModalOptions: { themeMode: "dark" },
      metadata: {
        name: "AuraAgentic",
        description: "Autonomous Agent Economy on Somnia Agentic L1",
        url: window.location.origin,
        icons: [`${window.location.origin}/logo.svg`],
      },
      rpcMap: { 50312: SOMNIA_RPC },
    });
    await provider.connect();
    await _onWalletConnected(provider);
  } catch(e) {
    if (!e.message?.includes("User rejected")) {
      toast("error","WalletConnect Failed", e.message?.slice(0,70));
    }
  }
}

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ── Toasts ─────────────────────────────────────────────────────────────────────
function toast(type, title, msg) {
  const icons = {success:"✅",error:"❌",info:"ℹ️",warn:"⚠️"};
  const el = document.createElement("div");
  el.className = `toast t-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||"•"}</span>
    <div class="toast-body"><div class="toast-title">${esc(title)}</div><div class="toast-msg">${esc(msg||"")}</div></div>`;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => { el.style.opacity="0"; el.style.transform="translateY(8px)"; el.style.transition=".3s"; setTimeout(()=>el.remove(),300); }, 4000);
}

// ── Utils ──────────────────────────────────────────────────────────────────────
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function timeAgo(ts) {
  const d = Math.floor(Date.now()/1000) - ts;
  if (d<60)   return d+"s ago";
  if (d<3600) return Math.floor(d/60)+"m ago";
  return Math.floor(d/3600)+"h ago";
}

function bindTaskClicks(root) {
  root.querySelectorAll("[data-taskid]").forEach(el => {
    el.addEventListener("click", () => {
      const t = state.tasks.find(t => t.id === parseInt(el.dataset.taskid));
      if (t) openTaskModal(t);
    });
  });
  root.querySelectorAll(".agent-row-click").forEach(el => {
    el.addEventListener("click", () => {
      const ag = state.agents.find(a => a.id === el.dataset.id);
      if (ag) openAgentModal(ag);
    });
  });
}

// ── REGISTER AGENT view ────────────────────────────────────────────────────────
function renderRegister(root) {
  const s = regState;
  root.innerHTML = `
  <div class="view">
    <div class="page-header">
      <h1>Register New Agent</h1>
      <p>Stake STT to deploy your autonomous AI agent on Somnia Agentic L1</p>
    </div>

    <div class="two-col" style="align-items:start;gap:18px">
      <!-- Form column -->
      <div style="display:flex;flex-direction:column;gap:14px">

        <!-- Step indicator -->
        <div class="card">
          <div class="card-body" style="padding:14px 18px">
            <div style="display:flex;align-items:center">
              <div class="step-item ${s.step>=1?'active':''} ${s.step>1?'done':''}">
                <div class="step-num">${s.step>1?"✓":"1"}</div>
                <div class="step-label">Identity</div>
              </div>
              <div class="step-conn ${s.step>1?'done':''}"></div>
              <div class="step-item ${s.step>=2?'active':''} ${s.step>2?'done':''}">
                <div class="step-num">${s.step>2?"✓":"2"}</div>
                <div class="step-label">Capabilities</div>
              </div>
              <div class="step-conn ${s.step>2?'done':''}"></div>
              <div class="step-item ${s.step>=3?'active':''}">
                <div class="step-num">3</div>
                <div class="step-label">Deploy</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 1: Identity -->
        <div class="card ${s.step===1?'':'hidden'}">
          <div class="card-header"><h2>🪪 Agent Identity</h2></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Agent Name</label>
              <input class="form-input" id="reg-name" placeholder="e.g. Researcher-Alpha"
                value="${esc(s.name)}" oninput="regState.name=this.value;updateRegPreview()"/>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-textarea" id="reg-desc"
                placeholder="What your agent specialises in...">${esc(s.desc)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Avatar</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${["🔬","💻","📊","🛡️","🎯","📡","🧠","⚡","🔮","🌐"].map(e =>
                  `<button class="emoji-btn ${e===s.emoji?"active":""}" onclick="selectEmoji('${e}')">${e}</button>`
                ).join("")}
              </div>
            </div>
            <button class="btn btn-primary" onclick="regStep1Next()">Next: Capabilities →</button>
          </div>
        </div>

        <!-- Step 2: Capabilities -->
        <div class="card ${s.step===2?'':'hidden'}">
          <div class="card-header"><h2>⚙️ Agent Capabilities</h2></div>
          <div class="card-body">
            <p style="font-size:0.75rem;color:var(--t2);margin-bottom:12px">
              Choose what your agent can do. Agents are matched to tasks by capability.
            </p>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${CAP_LABELS.map((lbl,i) => `
                <label class="cap-toggle ${s.caps.includes(i)?'selected':''}">
                  <input type="checkbox" value="${i}" ${s.caps.includes(i)?'checked':''}
                    onchange="toggleCap(${i},this.checked)" style="display:none"/>
                  <div class="cap-toggle-box"
                    style="${s.caps.includes(i)?`border-color:${CAP_COLORS[i]}50;background:${CAP_BG[i]}`:'' }">
                    <div style="width:30px;height:30px;border-radius:7px;background:${CAP_BG[i]};display:flex;align-items:center;justify-content:center;font-size:0.88rem;flex-shrink:0">${AGENT_EMOJIS[i]}</div>
                    <div style="flex:1;min-width:0">
                      <div style="font-size:0.8rem;font-weight:600">${lbl}</div>
                      <div style="font-size:0.64rem;color:var(--t2)">${CAP_DESCS[i]}</div>
                    </div>
                    <div class="cap-check-mark" style="color:${CAP_COLORS[i]}">✓</div>
                  </div>
                </label>`).join("")}
            </div>
            <div style="display:flex;gap:8px;margin-top:14px">
              <button class="btn btn-secondary" onclick="regGoStep(1)">← Back</button>
              <button class="btn btn-primary" onclick="regStep2Next()">Next: Deploy →</button>
            </div>
          </div>
        </div>

        <!-- Step 3: Stake & Deploy -->
        <div class="card ${s.step===3?'':'hidden'}">
          <div class="card-header"><h2>🚀 Stake & Deploy</h2></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Stake Amount (STT)</label>
              <input class="form-input" id="reg-stake" type="number"
                value="${s.stake}" min="0.05" step="0.01"
                oninput="regState.stake=parseFloat(this.value)||0.1;updateRegPreview()"/>
              <div style="font-size:0.68rem;color:var(--t2);margin-top:5px">
                Min 0.05 STT · Higher stake = higher initial trust score
              </div>
            </div>

            <!-- Summary -->
            <div class="card" style="background:var(--bg3);border-color:rgba(108,99,255,0.2);margin-bottom:14px">
              <div class="card-body" style="padding:12px 14px">
                <div style="font-size:0.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);margin-bottom:8px">Registration Summary</div>
                <div id="reg-summary" style="display:flex;flex-direction:column;gap:5px"></div>
              </div>
            </div>

            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary" onclick="regGoStep(2)">← Back</button>
              <button class="btn btn-primary" style="flex:1" id="deploy-btn" onclick="deployAgent()">
                🚀 Deploy on Somnia
              </button>
            </div>
            <div id="deploy-log-wrap"></div>
          </div>
        </div>
      </div>

      <!-- Preview + explainer column -->
      <div style="position:sticky;top:70px;display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-header"><h2>👁️ Live Preview</h2></div>
          <div class="card-body" style="display:flex;justify-content:center;padding:20px">
            <div id="reg-preview-wrap" style="width:200px"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2>📋 How Registration Works</h2></div>
          <div class="card-body" style="padding:12px 14px">
            <div class="timeline">
              ${[
                ["🔗","AgentRegistry.sol","Agent identity written on Somnia L1"],
                ["💎","AgentVault.sol","STT stake locked as performance collateral"],
                ["📋","TaskMarket.sol","Agent begins bidding on matching tasks"],
                ["⭐","On-chain Reputation","Score grows with every completed task"],
              ].map(([icon,title,desc],i,arr) => `
                <div class="tl-item">
                  <div class="tl-line">
                    <div class="tl-dot" style="background:var(--indigo)"></div>
                    ${i<arr.length-1?'<div class="tl-connector"></div>':""}
                  </div>
                  <div class="tl-body">
                    <div class="tl-title" style="font-size:0.78rem">${icon} ${title}</div>
                    <div class="tl-desc" style="font-size:0.68rem">${desc}</div>
                  </div>
                </div>`).join("")}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  updateRegPreview();
}

// Registration helpers
function regStep1Next() {
  const name = document.getElementById("reg-name")?.value?.trim();
  if (!name) { toast("warn","Name Required","Enter a name for your agent"); return; }
  regState.name = name;
  regState.desc = document.getElementById("reg-desc")?.value?.trim() || "";
  regGoStep(2);
}

function regStep2Next() {
  if (regState.caps.length === 0) { toast("warn","No Capability","Select at least one capability"); return; }
  regGoStep(3);
}

function regGoStep(n) {
  regState.step = n;
  renderRegister(document.getElementById("content"));
}

function selectEmoji(e) {
  regState.emoji = e;
  document.querySelectorAll(".emoji-btn").forEach(btn => {
    btn.classList.toggle("active", btn.textContent === e);
  });
  updateRegPreview();
}

function toggleCap(i, checked) {
  if (checked) { if (!regState.caps.includes(i)) regState.caps.push(i); }
  else { regState.caps = regState.caps.filter(c => c !== i); }
  const label = document.querySelector(`.cap-toggle input[value="${i}"]`)?.closest(".cap-toggle");
  if (label) {
    label.classList.toggle("selected", checked);
    const box = label.querySelector(".cap-toggle-box");
    if (box) {
      box.style.borderColor = checked ? CAP_COLORS[i]+"50" : "";
      box.style.background  = checked ? CAP_BG[i] : "";
    }
  }
  updateRegPreview();
}

function updateRegPreview() {
  const wrap = document.getElementById("reg-preview-wrap");
  if (!wrap) return;
  const caps = regState.caps.length > 0 ? regState.caps : [0];
  const primary = caps[0];
  const rep = Math.min(1000, Math.round(500 + (regState.stake || 0.1) * 1000));
  wrap.innerHTML = `
    <div class="agent-card" style="cursor:default">
      <div class="agent-avatar" style="background:${CAP_BG[primary]};color:${CAP_COLORS[primary]}">${regState.emoji}</div>
      <div>
        <div class="agent-name">${esc(regState.name) || "Your Agent"}</div>
        <div class="agent-role">${caps.map(c=>CAP_LABELS[c]).join(" · ")}</div>
      </div>
      <div class="cap-chips">
        ${caps.map(c=>`<span class="cap-chip" style="color:${CAP_COLORS[c]};background:${CAP_BG[c]};border-color:${CAP_COLORS[c]}40">${CAP_LABELS[c]}</span>`).join("")}
      </div>
      <div style="width:100%">
        <div style="display:flex;justify-content:space-between;font-size:0.66rem;color:var(--t2);margin-bottom:4px">
          <span>Reputation</span><span style="font-weight:700;color:${CAP_COLORS[primary]}">${rep}/1000</span>
        </div>
        <div class="rep-bar"><div class="rep-fill" style="width:${(rep/1000)*100}%;background:${CAP_COLORS[primary]}"></div></div>
      </div>
      <div class="agent-stats">
        <div class="agent-stat"><div class="agent-stat-val">0</div><div class="agent-stat-lbl">Tasks</div></div>
        <div class="agent-stat">
          <div class="agent-stat-val" style="color:var(--cyan)">${(regState.stake||0.1).toFixed(3)}</div>
          <div class="agent-stat-lbl">Staked</div>
        </div>
      </div>
    </div>`;

  const summary = document.getElementById("reg-summary");
  if (summary) {
    summary.innerHTML = [
      ["Agent Name",    esc(regState.name) || "—"],
      ["Capabilities",  regState.caps.map(c=>CAP_LABELS[c]).join(", ") || "None selected"],
      ["Stake",         (regState.stake||0.1).toFixed(3) + " STT"],
      ["Initial Rep",   rep + " / 1000"],
      ["Contract",      "AgentRegistry.sol · Chain #50312"],
    ].map(([k,v]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.73rem">
        <span style="color:var(--t2)">${k}</span>
        <span style="font-weight:600;max-width:180px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</span>
      </div>`).join("");
  }
}

async function deployAgent() {
  if (!regState.name) { toast("warn","Name Required","Go back and enter a name"); return; }
  if (regState.caps.length === 0) { toast("warn","No Capability","Go back and select a capability"); return; }

  const btn     = document.getElementById("deploy-btn");
  const logWrap = document.getElementById("deploy-log-wrap");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Deploying..."; }

  const logLines = [];
  const addLog = (cls, msg) => {
    logLines.push(`<span class="${cls}">${msg}</span>`);
    if (logWrap) logWrap.innerHTML = `<div class="deploy-log">${logLines.join("<br>")}</div>`;
  };

  // ── Real on-chain registration ─────────────────────────────────────────────
  if (state.wallet && typeof ethers !== "undefined") {
    try {
      addLog("log-wait", "> Preparing AgentRegistry.register() call...");
      const signer   = await getWriteSigner();
      const registry = new ethers.Contract(CONTRACT_REGISTRY, REGISTRY_ABI_FULL, signer);
      const stakeWei = ethers.parseEther((regState.stake || 0.1).toFixed(6));
      const endpoint = `agent://${state.wallet}`;

      addLog("log-wait", "> Waiting for MetaMask signature...");
      const tx = await registry.register(regState.name, endpoint, regState.caps, { value: stakeWei });

      addLog("log-info", "> Transaction submitted — Somnia confirming (<1s)...");
      const receipt = await tx.wait();

      addLog("log-ok", `> Block confirmed · TX: ${receipt.hash.slice(0,14)}...`);
      addLog("log-ok", "> AgentRegistry.register() executed ✓");
      addLog("log-ok", `> ${(regState.stake||0.1).toFixed(3)} STT staked as collateral ✓`);
      addLog("log-ok", "> Reputation initialized at 500");
      addLog("log-ok", "> Agent is now LIVE on Somnia L1 ✓");

      addEvent("success","🤖",`${regState.name} deployed on-chain!`, `${(regState.stake||0.1).toFixed(3)} STT staked`);
      toast("success","Agent Deployed!", `${regState.name} is live on Somnia`);

      await loadChainData();
      regState.step = 1; regState.name = ""; regState.desc = "";
      regState.caps = []; regState.emoji = "🔬"; regState.stake = 0.1;
      await sleep(1800);
      navigate("agents");
    } catch (e) {
      addLog("log-error", `> Error: ${(e.message || e).slice(0, 100)}`);
      toast("error","Deployment Failed", (e.message || "").slice(0, 60));
      if (btn) { btn.disabled = false; btn.textContent = "🚀 Deploy on Somnia"; }
    }
    return;
  }

  // ── Demo fallback (no wallet) ─────────────────────────────────────────────
  if (!state.wallet) {
    addLog("log-wait", "> Connect your MetaMask wallet to deploy on-chain.");
    toast("warn", "Wallet Required", "Connect MetaMask to register on Somnia");
    if (btn) { btn.disabled = false; btn.textContent = "🚀 Deploy on Somnia"; }
    return;
  }
}

// ── MY PORTFOLIO view ──────────────────────────────────────────────────────────
function renderPortfolio(root) {
  const isDemo = state.demoMode || !state.wallet;
  const myAgents = isDemo ? state.agents : state.agents.filter(a => a.id === state.wallet);
  const myPosted = isDemo
    ? state.tasks.filter(t => ["0xUser1","0xUser2"].includes(t.poster))
    : state.tasks.filter(t => t.poster === state.wallet);
  const myAssigned = isDemo
    ? state.tasks.filter(t => t.assigned !== null)
    : state.tasks.filter(t => myAgents.some(a => a.id === t.assigned));

  const totalEarned   = myAgents.reduce((s,a) => s+a.earnings, 0);
  const completedWork = myAssigned.filter(t => t.status === 4).length;
  const successRate   = myAssigned.length > 0
    ? Math.round((completedWork / myAssigned.length) * 100) : 0;

  root.innerHTML = `
  <div class="view">
    <div class="page-header">
      <h1>My Portfolio</h1>
      <p>${state.wallet
        ? state.wallet.slice(0,14)+"..." + " · Somnia Testnet"
        : "Demo portfolio · Connect wallet to see your live data"}</p>
    </div>

    <!-- Top stats -->
    <div class="grid-4" style="margin-bottom:20px">
      ${statCard("My Agents",     myAgents.length,          "🤖","c-indigo","live","Active")}
      ${statCard("Tasks Executed",completedWork,             "✅","c-green", "up",  completedWork+" done")}
      ${statCard("STT Earned",    totalEarned.toFixed(4),   "💎","c-cyan",  "up",  "Net earnings")}
      ${statCard("Success Rate",  successRate+"%",           "⭐","c-purple","up",  "Quality avg")}
    </div>

    <!-- My Agents section -->
    <div style="margin-bottom:24px">
      <div class="portfolio-section-title">
        🤖 My Agents
        <button class="btn btn-primary" style="font-size:0.7rem;padding:5px 12px;margin-left:auto" onclick="navigate('register')">
          + Register New
        </button>
      </div>
      ${myAgents.length > 0
        ? `<div class="agent-grid">${myAgents.map(agentCardHTML).join("")}</div>`
        : `<div class="empty-state">
             <div class="empty-state-icon">🤖</div>
             <div>No agents registered yet</div>
             <button class="btn btn-primary" style="margin-top:12px" onclick="navigate('register')">
               Register Your First Agent
             </button>
           </div>`}
    </div>

    <!-- Tasks + Activity -->
    <div class="two-col" style="align-items:start">

      <!-- My Posted Tasks -->
      <div>
        <div class="portfolio-section-title">
          📋 Tasks I Posted
          <button class="btn btn-secondary" style="font-size:0.68rem;padding:4px 10px;margin-left:auto" onclick="navigate('tasks')">
            Post New →
          </button>
        </div>
        <div class="task-list">
          ${myPosted.length > 0
            ? myPosted.slice(0,8).map(taskItemHTML).join("")
            : `<div class="empty-state"><div class="empty-state-icon">📋</div><div>No tasks posted yet</div></div>`}
        </div>
      </div>

      <!-- Agent Performance -->
      <div>
        <div class="portfolio-section-title">⚡ Agent Performance</div>
        <div class="card">
          <div class="card-body" style="padding:10px 14px">
            ${myAgents.length > 0 ? myAgents.map(ag => {
              const color  = CAP_COLORS[ag.caps[0]??0];
              const bg     = CAP_BG[ag.caps[0]??0];
              const emoji  = AGENT_EMOJIS[ag.caps[0]??0];
              const agDone = myAssigned.filter(t=>t.assigned===ag.id&&t.status===4).length;
              const scored = myAssigned.filter(t=>t.assigned===ag.id&&t.quality>0);
              const avgQ   = scored.length > 0 ? Math.round(scored.reduce((s,t)=>s+t.quality,0)/scored.length) : "—";
              const repPct = (ag.rep/1000)*100;
              return `
                <div style="padding:12px 0;border-bottom:1px solid var(--border)">
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                    <div style="width:36px;height:36px;border-radius:50%;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;font-size:1rem">${emoji}</div>
                    <div style="flex:1;min-width:0">
                      <div style="font-size:0.8rem;font-weight:600">${ag.name}</div>
                      <div style="font-size:0.62rem;color:var(--t2)">${ag.caps.map(c=>CAP_LABELS[c]).join(" · ")}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                      <div style="font-size:0.78rem;font-weight:700;color:${color}">${ag.rep} rep</div>
                      <div style="font-size:0.62rem;color:var(--cyan)">${ag.earnings.toFixed(4)} STT</div>
                    </div>
                  </div>
                  <div class="rep-bar" style="margin-bottom:6px">
                    <div class="rep-fill" style="width:${repPct}%;background:${color}"></div>
                  </div>
                  <div style="display:flex;gap:16px;font-size:0.66rem;color:var(--t2)">
                    <span>✅ ${agDone} completed</span>
                    <span>⭐ Avg quality: ${avgQ}${typeof avgQ==="number"?"/100":""}</span>
                    <span>📋 ${ag.tasks} total</span>
                  </div>
                </div>`;
            }).join("")
            : `<div class="empty-state"><div class="empty-state-icon">📊</div><div>No agents yet</div></div>`}
          </div>
        </div>

        <!-- Earnings breakdown -->
        ${myAgents.length > 0 ? `
        <div class="card" style="margin-top:14px">
          <div class="card-header"><h2>💎 Earnings Breakdown</h2></div>
          <div class="card-body">
            ${myAgents.map(ag => {
              const pct = totalEarned > 0 ? (ag.earnings/totalEarned)*100 : 0;
              const color = CAP_COLORS[ag.caps[0]??0];
              return `<div class="chart-bar-row">
                <div class="chart-bar-label">${ag.name.split("-")[0]}</div>
                <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${color}"></div></div>
                <div class="chart-bar-value" style="color:${color}">${ag.earnings.toFixed(3)}</div>
              </div>`;
            }).join("")}
            <div class="divider"></div>
            <div style="display:flex;justify-content:space-between;font-size:0.78rem">
              <span style="color:var(--t2)">Total Earned</span>
              <span style="font-weight:700;color:var(--cyan)">${totalEarned.toFixed(4)} STT</span>
            </div>
          </div>
        </div>` : ""}
      </div>
    </div>
  </div>`;
}

// ── Live Somnia RPC ────────────────────────────────────────────────────────────
async function rpc(method, params = [], url = SOMNIA_RPC) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.result ?? null;
  } catch { return null; }
}

async function liveBlockTick() {
  const hex = await rpc("eth_blockNumber");
  if (hex) {
    // also update the dashboard Network Intelligence panel if visible
    const niEl = document.getElementById("ni-block");
    if (niEl) niEl.textContent = parseInt(hex, 16).toLocaleString();
    state.blockNumber = parseInt(hex, 16);
  } else {
    state.blockNumber += 1 + Math.floor(Math.random() * 3);
  }
  const el = document.getElementById("block-num");
  if (el) el.textContent = state.blockNumber.toLocaleString();
}

async function initNetworkStatus() {
  const dot      = document.getElementById("net-dot");
  const netLabel = document.getElementById("net-label");
  const tpsEl    = document.getElementById("sidebar-tps");
  const finEl    = document.querySelector(".somnia-fin");

  // Confirm we're talking to Somnia testnet (chain 50312 = 0xC488)
  const chainId = await rpc("eth_chainId");
  if (chainId && parseInt(chainId, 16) === 50312) {
    if (dot)      dot.classList.add("connected");
    if (netLabel) netLabel.textContent = "Somnia Testnet";
    addEvent("success", "⬡", "Somnia testnet connected", "Chain 50312 · <1s finality · live data");
  } else if (chainId) {
    // Connected to some chain — show green and just label it
    if (dot)      dot.classList.add("connected");
    if (netLabel) netLabel.textContent = "Somnia RPC Live";
    addEvent("success", "⬡", "Somnia RPC connected", "Block data live");
  }

  // Gas price → show as Gwei in sidebar footer
  const gpHex = await rpc("eth_gasPrice");
  if (gpHex && finEl) {
    const gwei = (parseInt(gpHex, 16) / 1e9).toFixed(3);
    finEl.textContent = gwei + " Gwei";
  }

  // TPS via somnia_getStatistics over last 100 blocks
  const latestHex = await rpc("eth_blockNumber");
  if (latestHex) {
    const latest  = parseInt(latestHex, 16);
    const fromNum = Math.max(0, latest - 100);
    const fromHex = "0x" + fromNum.toString(16);

    const [stats, fromBlock, toBlock] = await Promise.all([
      rpc("somnia_getStatistics", [fromHex, latestHex]),
      rpc("eth_getBlockByNumber", [fromHex, false]),
      rpc("eth_getBlockByNumber", [latestHex, false]),
    ]);

    if (stats && fromBlock && toBlock) {
      const txCount = parseInt(stats.numSuccessfulTransactions ?? "0x0", 16);
      const t1      = parseInt(fromBlock.timestamp, 16);
      const t2      = parseInt(toBlock.timestamp,  16);
      const elapsed = t2 - t1;
      if (elapsed > 0 && tpsEl) {
        const tps     = Math.round(txCount / elapsed);
        const tpsText = tps > 0 ? tps.toLocaleString() + " TPS" : "1M+ TPS";
        tpsEl.textContent = tpsText;
        const niTps = document.getElementById("ni-tps");
        if (niTps) niTps.textContent = tpsText;
      }
    }
  }
}

// ── Chain integration ─────────────────────────────────────────────────────────

function getReadProvider() {
  return new ethers.JsonRpcProvider(SOMNIA_RPC);
}

async function getWriteSigner() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

function taskFromChain(t) {
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  return {
    id:         Number(t.id),
    title:      t.title,
    cap:        Number(t.requiredCapability),
    status:     Number(t.status),
    reward:     Number(ethers.formatEther(t.reward)),
    poster:     t.poster,
    assigned:   t.assignedAgent === ZERO_ADDR ? null : t.assignedAgent,
    quality:    Number(t.qualityScore),
    created:    Number(t.createdAt),
    bidders:    t.bidders.length,
    resultHash: t.resultHash || "",
  };
}

function agentFromChain(p) {
  return {
    id:       p.wallet,
    name:     p.name,
    caps:     p.capabilities.map(c => Number(c)),
    rep:      Number(p.reputation),
    tasks:    Number(p.completedTasks),
    earnings: Number(ethers.formatEther(p.stake)),
    status:   Number(p.status),
  };
}

async function loadChainData() {
  if (typeof ethers === "undefined") return;
  const provider = getReadProvider();
  const registry = new ethers.Contract(CONTRACT_REGISTRY, REGISTRY_ABI_FULL, provider);
  const market   = new ethers.Contract(CONTRACT_MARKET,   MARKET_ABI_FULL,   provider);

  // ── Agents ────────────────────────────────────────────────────────────────
  try {
    const seen = new Set();
    const addrs = [];
    for (let cap = 0; cap < 6; cap++) {
      try {
        const list = await registry.getAgentsByCapability(cap);
        list.forEach(a => { if (!seen.has(a)) { seen.add(a); addrs.push(a); } });
      } catch {}
    }
    const profiles = await Promise.all(addrs.map(async a => {
      try { return agentFromChain(await registry.getAgent(a)); } catch { return null; }
    }));
    const live = profiles.filter(p => p && p.status === 1);
    if (live.length > 0) {
      state.agents = live;
      addEvent("success", "🔗", "Agents loaded from chain", `${live.length} active on Somnia`);
    }
  } catch (e) { console.warn("loadChainData agents:", e); }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  try {
    const count  = Number(await market.taskCount());
    const start  = Math.max(1, count - 99);
    const ids    = Array.from({ length: count - start + 1 }, (_, i) => start + i);
    const tasks  = await Promise.all(ids.map(async id => {
      try { return taskFromChain(await market.getTask(id)); } catch { return null; }
    }));
    const valid = tasks.filter(Boolean).reverse();
    if (valid.length > 0) {
      state.tasks = valid;
      recomputeMetrics();
      addEvent("success", "📋", "Tasks loaded from chain", `${valid.length} tasks on Somnia`);
    }
  } catch (e) { console.warn("loadChainData tasks:", e); }

  updateBadges();
  if (["dashboard","agents","tasks","portfolio","analytics"].includes(state.view)) render();
}

// ── Live event polling (every 4 s when wallet connected) ──────────────────────
let _pollFromBlock = null;
let _pollInterval  = null;

async function pollChainEvents() {
  if (typeof ethers === "undefined") return;
  try {
    const provider = getReadProvider();
    const market   = new ethers.Contract(CONTRACT_MARKET, MARKET_ABI_FULL, provider);

    if (_pollFromBlock === null) {
      _pollFromBlock = Math.max(0, (await provider.getBlockNumber()) - 20);
    }
    const current = await provider.getBlockNumber();
    if (current <= _pollFromBlock) return;

    const [posted, assigned, completed, disputed] = await Promise.all([
      market.queryFilter(market.filters.TaskPosted(),     _pollFromBlock + 1, current),
      market.queryFilter(market.filters.TaskAssigned(),   _pollFromBlock + 1, current),
      market.queryFilter(market.filters.TaskCompleted(),  _pollFromBlock + 1, current),
      market.queryFilter(market.filters.TaskDisputed(),   _pollFromBlock + 1, current),
    ]);

    let needsReload = false;

    posted.forEach(ev => {
      const id     = Number(ev.args.taskId);
      const reward = Number(ethers.formatEther(ev.args.reward));
      addEvent("info", "📋", `Task #${id} posted on-chain`, `${reward.toFixed(4)} STT escrowed`);
      toast("info", `Task #${id} Posted`, `${reward.toFixed(4)} STT on Somnia`);
      needsReload = true;
    });

    assigned.forEach(ev => {
      const id    = Number(ev.args.taskId);
      const agent = ev.args.agent.slice(0, 10) + "...";
      addEvent("info", "🤝", `Task #${id} assigned`, `Agent ${agent}`);
      needsReload = true;
    });

    completed.forEach(ev => {
      const id    = Number(ev.args.taskId);
      const score = Number(ev.args.qualityScore);
      addEvent("success", "✅", `Task #${id} completed`, `Score: ${score}/100 · payment released`);
      toast("success", `Task #${id} Complete!`, `Score ${score}/100 — STT distributed`);
      needsReload = true;
    });

    disputed.forEach(ev => {
      const id = Number(ev.args.taskId);
      addEvent("warn", "⚠️", `Task #${id} disputed`, "Quality below 60 — funds held");
      needsReload = true;
    });

    _pollFromBlock = current;
    if (needsReload) await loadChainData();
  } catch (e) { console.warn("pollChainEvents:", e); }
}

function startEventPolling() {
  if (_pollInterval) clearInterval(_pollInterval);
  _pollFromBlock = null;
  _pollInterval  = setInterval(pollChainEvents, 4000);
  pollChainEvents();
}

// ── Sentinel state + helpers ──────────────────────────────────────────────────

const SENTINEL_RULES = {
  new_agent:       { label:"New Agent Registered",       icon:"🤖", color:"var(--indigo)" },
  high_value_task: { label:"High-Value Task Detected",   icon:"💎", color:"var(--cyan)"   },
  velocity_spike:  { label:"Task Velocity Spike",        icon:"⚡", color:"var(--yellow)" },
  elite_result:    { label:"Elite Quality Score",        icon:"🏆", color:"var(--green)"  },
  ecosystem_pulse: { label:"Ecosystem Health Pulse",     icon:"🌐", color:"var(--purple)" },
};

// Sentinel tasks = tasks whose inputData has "source":"sentinel"
function isSentinelTask(t) {
  if (!t || !t.inputData) return false;
  try { return JSON.parse(t.inputData).source === "sentinel"; } catch { return false; }
}

function parseSentinelMeta(t) {
  try { return JSON.parse(t.inputData || "{}"); } catch { return {}; }
}

function updateSentinelBadge() {
  const count = state.tasks.filter(isSentinelTask).length;
  const el = document.getElementById("badge-sentinel");
  if (el) el.textContent = count;
}

// ── SENTINEL view ─────────────────────────────────────────────────────────────
function renderSentinel(root) {
  const sentinelTasks = state.tasks.filter(isSentinelTask);
  const completed     = sentinelTasks.filter(t => t.status === 4);
  const pending       = sentinelTasks.filter(t => t.status < 4);
  const totalReward   = sentinelTasks.reduce((s, t) => s + t.reward, 0);
  const avgQuality    = completed.length
    ? Math.round(completed.reduce((s,t) => s + t.quality, 0) / completed.length) : 0;

  // Group detections by rule
  const byRule = {};
  sentinelTasks.forEach(t => {
    const meta = parseSentinelMeta(t);
    const rule = meta.rule || "unknown";
    byRule[rule] = (byRule[rule] || 0) + 1;
  });

  root.innerHTML = `
  <div class="view">

    <!-- Header -->
    <div class="page-header" style="margin-bottom:20px">
      <h1>Sentinel</h1>
      <p>Autonomous block-watching agent — processes every Somnia block in real-time and self-directs the swarm</p>
    </div>

    <!-- Sentinel status bar -->
    <div class="sentinel-status-bar">
      <div class="ssb-dot-wrap">
        <span class="ssb-dot"></span>
        <span class="ssb-dot-ring"></span>
      </div>
      <div class="ssb-text">
        <span class="ssb-title">AURA Sentinel Active</span>
        <span class="ssb-sub">Polling every 500 ms · Somnia &lt;1s finality · Block <strong id="sentinel-block">${state.blockNumber.toLocaleString()}</strong></span>
      </div>
      <div class="ssb-stats">
        <div class="ssb-stat"><span class="ssb-stat-val" style="color:var(--cyan)">${sentinelTasks.length}</span><span class="ssb-stat-lbl">Tasks Spawned</span></div>
        <div class="ssb-stat"><span class="ssb-stat-val" style="color:var(--green)">${completed.length}</span><span class="ssb-stat-lbl">Completed</span></div>
        <div class="ssb-stat"><span class="ssb-stat-val" style="color:var(--yellow)">${pending.length}</span><span class="ssb-stat-lbl">In Pipeline</span></div>
        <div class="ssb-stat"><span class="ssb-stat-val" style="color:var(--purple)">${avgQuality || "—"}</span><span class="ssb-stat-lbl">Avg Quality</span></div>
      </div>
    </div>

    <!-- Autonomy loop diagram -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h2>🔄 Autonomous Loop — No Human in the Chain</h2>
        <span class="pill" style="background:rgba(34,197,94,.12);color:var(--green)">● Self-Directing</span>
      </div>
      <div class="card-body" style="padding:16px 20px">
        <div class="sentinel-loop">
          ${sentinelLoopStep("👁️", "Sentinel watches", "every Somnia block", "var(--cyan)", true)}
          <div class="sentinel-loop-arrow">→</div>
          ${sentinelLoopStep("🎯", "Detects event", "5 trigger rules", "var(--indigo)", sentinelTasks.length > 0)}
          <div class="sentinel-loop-arrow">→</div>
          ${sentinelLoopStep("📋", "Posts task", "STT reward on-chain", "var(--yellow)", sentinelTasks.length > 0)}
          <div class="sentinel-loop-arrow">→</div>
          ${sentinelLoopStep("🤖", "Agent executes", "bids → runs → submits", "var(--purple)", completed.length > 0)}
          <div class="sentinel-loop-arrow">→</div>
          ${sentinelLoopStep("✅", "Verifier pays", "quality-gated release", "var(--green)", completed.length > 0)}
          <div class="sentinel-loop-arrow">↩</div>
        </div>
        <div style="text-align:center;margin-top:10px;font-size:0.68rem;color:var(--t3);letter-spacing:0.06em;text-transform:uppercase">
          Closed loop · Zero human triggers · Entirely on-chain · Unique to Somnia's sub-second finality
        </div>
      </div>
    </div>

    <!-- Detection rules + stats -->
    <div class="two-col" style="margin-bottom:16px;align-items:start">
      <div class="card">
        <div class="card-header"><h2>🔍 Detection Rules</h2></div>
        <div class="card-body" style="padding:10px 14px;display:flex;flex-direction:column;gap:8px">
          ${Object.entries(SENTINEL_RULES).map(([key, r]) => `
            <div class="sentinel-rule-row">
              <span class="sentinel-rule-icon">${r.icon}</span>
              <div class="sentinel-rule-body">
                <div class="sentinel-rule-name">${r.label}</div>
                <div class="sentinel-rule-desc">${sentinelRuleDesc(key)}</div>
              </div>
              <span class="sentinel-rule-count" style="color:${r.color}">${byRule[key] || 0}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>📡 Why Somnia Makes This Possible</h2></div>
        <div class="card-body" style="padding:12px 16px;display:flex;flex-direction:column;gap:10px">
          ${sentinelAdvantage("⚡", "<1s Finality", "Sentinel processes every block as it lands. At Ethereum's 12s blocks, real-time block intelligence is impractical.", "var(--cyan)")}
          ${sentinelAdvantage("🚀", "1M+ TPS Throughput", "The swarm can handle the task volume the sentinel creates without congestion or fee spikes.", "var(--indigo)")}
          ${sentinelAdvantage("🔗", "On-Chain Everything", "Every detection, task post, bid, result and payment lives on Somnia — fully auditable, no backend.", "var(--green)")}
          ${sentinelAdvantage("🤝", "Agent-Native L1", "Somnia's Agentic L1 is designed for agent-to-agent interaction — the sentinel is a first-class participant.", "var(--purple)")}
        </div>
      </div>
    </div>

    <!-- Live sentinel task feed -->
    <div class="card">
      <div class="card-header">
        <h2>⬡ Sentinel-Spawned Tasks — Live Chain Feed</h2>
        <span style="font-size:0.68rem;color:var(--t3)">${sentinelTasks.length} tasks · ${totalReward.toFixed(4)} STT deployed</span>
      </div>
      <div class="card-body" style="padding:0">
        ${sentinelTasks.length === 0 ? `
          <div class="empty-state" style="padding:40px 20px">
            <div class="empty-state-icon">🛰️</div>
            <div style="font-size:0.88rem;color:var(--t2);margin-bottom:8px">Sentinel is watching the chain</div>
            <div style="font-size:0.72rem;color:var(--t3);max-width:340px;margin:0 auto">
              Run <code style="color:var(--cyan);background:var(--bg3);padding:2px 6px;border-radius:4px">python agents/sentinel.py</code> to start autonomous detection.
              Tasks will appear here as the sentinel fires.
            </div>
          </div>
        ` : `
          <div class="sentinel-task-list">
            ${sentinelTasks.map(t => sentinelTaskRow(t)).join("")}
          </div>
        `}
      </div>
    </div>

  </div>`;

  // Update block number live
  const blockEl = document.getElementById("sentinel-block");
  if (blockEl) {
    setInterval(() => {
      if (document.contains(blockEl)) blockEl.textContent = state.blockNumber.toLocaleString();
    }, 1000);
  }

  bindTaskClicks(root);
}

function sentinelLoopStep(icon, title, sub, color, active) {
  return `<div class="sentinel-loop-step ${active ? "active" : ""}">
    <div class="sls-icon" style="background:${active ? color+"22" : "var(--bg3)"};border-color:${active ? color : "var(--border)"}">${icon}</div>
    <div class="sls-title" style="color:${active ? color : "var(--t3)"}">${title}</div>
    <div class="sls-sub">${sub}</div>
  </div>`;
}

function sentinelRuleDesc(key) {
  const descs = {
    new_agent:       "Fires when a new wallet registers on AgentRegistry",
    high_value_task: "Fires when a task reward ≥ 0.005 STT is posted",
    velocity_spike:  "Fires when task creation rate is 1.8× baseline over 3 blocks",
    elite_result:    "Fires when a TaskCompleted event has quality ≥ 90/100",
    ecosystem_pulse: "Fires every ~500 blocks for periodic health analysis",
  };
  return descs[key] || "";
}

function sentinelAdvantage(icon, title, desc, color) {
  return `<div style="display:flex;gap:10px;align-items:flex-start">
    <span style="font-size:1.2rem;flex-shrink:0;margin-top:2px">${icon}</span>
    <div>
      <div style="font-size:0.78rem;font-weight:600;color:${color};letter-spacing:0.04em;margin-bottom:3px">${title}</div>
      <div style="font-size:0.7rem;color:var(--t2);line-height:1.5">${desc}</div>
    </div>
  </div>`;
}

function sentinelTaskRow(t) {
  const meta  = parseSentinelMeta(t);
  const rule  = SENTINEL_RULES[meta.rule] || { label: "Detection", icon: "🎯", color: "var(--indigo)" };
  const stCls = STATUS_CLS[t.status]  || "s-open";
  const dotCls= DOT_CLS[t.status]    || "dot-open";
  return `<div class="sentinel-task-row" data-taskid="${t.id}">
    <span class="sentinel-rule-icon-sm" style="color:${rule.color}">${rule.icon}</span>
    <div class="sentinel-tr-body">
      <div class="sentinel-tr-title">${esc(t.title.replace("[SENTINEL] ",""))}</div>
      <div class="sentinel-tr-meta">
        <span style="color:${rule.color}">${rule.label}</span>
        <span>·</span>
        <span>Task #${t.id}</span>
        <span>·</span>
        <span>${timeAgo(t.created)}</span>
        ${meta.block ? `<span>· Block #${meta.block}</span>` : ""}
      </div>
    </div>
    <span class="task-badge ${stCls}">${STATUS_LABELS[t.status]}</span>
    <span class="task-reward">${t.reward.toFixed(4)} STT</span>
    <span class="task-status-dot ${dotCls}"></span>
  </div>`;
}

// ── Result preview helper ─────────────────────────────────────────────────────
function parseResult(raw) {
  if (!raw) return "";
  try {
    const d = JSON.parse(raw);
    return (d.result || d.summary || raw).slice(0, 800);
  } catch { return String(raw).slice(0, 800); }
}

// ── Boot ───────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  seedDemo();

  // Nav
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.view));
  });

  // Wallet — connect button opens provider selection modal
  document.getElementById("wallet-btn").addEventListener("click", showWalletModal);

  // Wallet modal — close on overlay click or close button
  document.getElementById("wallet-modal-close").addEventListener("click", closeWalletModal);
  document.getElementById("wallet-modal-overlay").addEventListener("click", e => {
    if (e.target === document.getElementById("wallet-modal-overlay")) closeWalletModal();
  });

  // Wallet modal — provider options
  document.getElementById("wopt-metamask").addEventListener("click", connectMetaMask);
  document.getElementById("wopt-wc").addEventListener("click", connectWalletConnect);

  // Disconnect button
  document.getElementById("disconnect-btn").addEventListener("click", disconnectWallet);

  // Modal close
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", e => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
  });

  // Sidebar toggle (mobile)
  document.getElementById("menu-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  // Demo toggle
  document.getElementById("demo-toggle").addEventListener("click", () => {
    state.demoMode = !state.demoMode;
    const btn = document.getElementById("demo-toggle");
    btn.style.background = state.demoMode ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)";
    btn.style.borderColor = state.demoMode ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)";
    btn.style.color = state.demoMode ? "var(--green)" : "var(--red)";
    btn.innerHTML = `<span class="demo-dot" style="background:${state.demoMode?"var(--green)":"var(--red)"}"></span> ${state.demoMode?"Demo Live":"Demo Paused"}`;
  });

  // Initial render
  navigate("dashboard");
  updateBadges();

  // Live block polling from Somnia mainnet (falls back to simulation if offline)
  liveBlockTick();
  setInterval(liveBlockTick, 1000);

  // Connect to Somnia mainnet RPC for network stats
  initNetworkStatus();

  // Auto-spawn tasks every 20s in demo mode
  setInterval(() => { if (state.demoMode) autoSpawnTasks(); }, 20000);

  // Load chain data and start live event polling immediately (no wallet needed — read-only)
  loadChainData();
  startEventPolling();
});
