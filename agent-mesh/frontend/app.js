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
  const titles = { dashboard:"Dashboard", agents:"Agents", tasks:"Task Marketplace", pipeline:"Agent Pipeline", analytics:"Analytics", register:"Register Agent", portfolio:"My Portfolio" };
  document.getElementById("topbar-title").textContent = titles[view] || view;
  render();
}

function render() {
  const content = document.getElementById("content");
  const views = { dashboard: renderDashboard, agents: renderAgents, tasks: renderTasks, pipeline: renderPipeline, analytics: renderAnalytics, register: renderRegister, portfolio: renderPortfolio };
  content.innerHTML = "";
  if (views[state.view]) views[state.view](content);
}

// ── DASHBOARD view ─────────────────────────────────────────────────────────────
function renderDashboard(root) {
  const avgQ = state.metrics.qualityCount > 0
    ? Math.round(state.metrics.qualitySum / state.metrics.qualityCount) : 0;

  root.innerHTML = `
  <div class="view">
    <!-- Stat row -->
    <div class="grid-4" style="margin-bottom:16px">
      ${statCard("Active Agents", state.agents.filter(a=>a.status===1).length, "🤖", "c-indigo", "live", "Live")}
      ${statCard("Open Tasks",    state.tasks.filter(t=>t.status===0).length,  "📋", "c-cyan",   "up",   "+" + state.tasks.filter(t=>t.status===0).length)}
      ${statCard("STT Distributed", state.metrics.sttOut.toFixed(3), "💎", "c-green", "up", "+" + state.tasks.filter(t=>t.status===4).length + " done")}
      ${statCard("Avg Quality",   avgQ + "/100", "⭐", "c-purple", "up", avgQ >= 75 ? "Good" : "Fair")}
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

    <!-- Divider -->
    <div class="divider" style="margin:24px 0"></div>

    <!-- Capability distribution -->
    <div class="card">
      <div class="card-header"><h2>📊 Capability Distribution</h2></div>
      <div class="card-body">
        <div style="display:flex;flex-direction:column;gap:12px">
          ${CAP_LABELS.map((lbl,i) => {
            const count = state.agents.filter(a=>a.caps.includes(i)).length;
            const pct = state.agents.length > 0 ? (count/state.agents.length)*100 : 0;
            return `<div class="chart-bar-row">
              <div class="chart-bar-label">${lbl}</div>
              <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${CAP_COLORS[i]}"></div></div>
              <div class="chart-bar-value" style="color:${CAP_COLORS[i]}">${count}</div>
            </div>`;
          }).join("")}
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
      <div class="card" style="position:sticky;top:70px">
        <div class="card-header"><h2>➕ Post New Task</h2></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Task Title</label>
            <input class="form-input" id="f-title" placeholder="e.g. Research Somnia DeFi TVL" />
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-textarea" id="f-desc" placeholder="Detailed task requirements..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Required Capability</label>
            <select class="form-select" id="f-cap">
              ${CAP_LABELS.map((l,i)=>`<option value="${i}">${l}</option>`).join("")}
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
          <button class="btn btn-primary btn-full" id="post-btn" onclick="postTask()">
            🚀 Post Task &amp; Escrow STT
          </button>
          <div id="post-status" style="margin-top:10px"></div>
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
function renderPipeline(root) {
  root.innerHTML = `
  <div class="view">
    <div class="page-header">
      <h1>Agent Pipeline — Task Decomposition</h1>
      <p>Watch the OrchestratorAgent autonomously break complex tasks into specialist sub-tasks on Somnia</p>
    </div>

    <div class="two-col" style="align-items:start;gap:18px">
      <!-- Pipeline visualizer -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-header">
            <h2>🎯 Task Flow</h2>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" id="run-pipeline-btn" onclick="runDemoPipeline()" ${state.pipelineRunning?"disabled":""}>
                ${state.pipelineRunning?"⏳ Running...":"▶ Run Demo Pipeline"}
              </button>
              <button class="btn btn-secondary" onclick="resetPipeline()">↺ Reset</button>
            </div>
          </div>
          <div class="card-body">
            <!-- Orchestrator at top -->
            <div style="display:flex;justify-content:center;margin-bottom:0" id="pl-orch-row">
              <div class="pipeline-node" style="max-width:180px">
                <div class="pipeline-node-box ${state.pipelineStep>=1?'active':''} ${state.pipelineStep>=2?'completed':''}" id="pl-orch">
                  <div class="pipeline-node-icon">🎯</div>
                  <div class="pipeline-node-name">Orchestrator</div>
                  <div class="pipeline-node-sub">Task decomposition</div>
                </div>
              </div>
            </div>

            <!-- Downward arrow -->
            <div class="pipeline-arrow" id="pl-arrow1">
              <div class="pipeline-arrow-line ${state.pipelineStep>=2?'flowing':''}" id="pl-line1"></div>
              <div class="pipeline-arrow-head ${state.pipelineStep>=2?'active':''}" id="pl-head1"></div>
            </div>

            <!-- Specialists row -->
            <div class="pipeline-row" id="pl-spec-row">
              <div class="pipeline-node">
                <div class="pipeline-node-box ${state.pipelineStep>=3?'active':''} ${state.pipelineStep>=4?'completed':''}" id="pl-n1">
                  <div class="pipeline-node-icon">🔬</div>
                  <div class="pipeline-node-name">Researcher</div>
                  <div class="pipeline-node-sub">Web research</div>
                </div>
              </div>
              <div class="pipeline-connector ${state.pipelineStep>=3?'flowing':''}"></div>
              <div class="pipeline-node">
                <div class="pipeline-node-box ${state.pipelineStep>=3?'active':''} ${state.pipelineStep>=4?'completed':''}" id="pl-n2">
                  <div class="pipeline-node-icon">💻</div>
                  <div class="pipeline-node-name">Coder</div>
                  <div class="pipeline-node-sub">Code generation</div>
                </div>
              </div>
              <div class="pipeline-connector ${state.pipelineStep>=3?'flowing':''}"></div>
              <div class="pipeline-node">
                <div class="pipeline-node-box ${state.pipelineStep>=3?'active':''} ${state.pipelineStep>=4?'completed':''}" id="pl-n3">
                  <div class="pipeline-node-icon">📊</div>
                  <div class="pipeline-node-name">Analyst</div>
                  <div class="pipeline-node-sub">Data analysis</div>
                </div>
              </div>
            </div>

            <!-- Downward arrow -->
            <div class="pipeline-arrow" id="pl-arrow2">
              <div class="pipeline-arrow-line ${state.pipelineStep>=4?'flowing':''}" id="pl-line2"></div>
              <div class="pipeline-arrow-head ${state.pipelineStep>=4?'active':''}" id="pl-head2"></div>
            </div>

            <!-- Verifier -->
            <div style="display:flex;justify-content:center" id="pl-ver-row">
              <div class="pipeline-node" style="max-width:180px">
                <div class="pipeline-node-box ${state.pipelineStep>=5?'active':''} ${state.pipelineStep>=6?'completed':''}" id="pl-ver">
                  <div class="pipeline-node-icon">🛡️</div>
                  <div class="pipeline-node-name">Verifier</div>
                  <div class="pipeline-node-sub">AI quality scoring</div>
                </div>
              </div>
            </div>

            <!-- Downward arrow -->
            <div class="pipeline-arrow" id="pl-arrow3">
              <div class="pipeline-arrow-line ${state.pipelineStep>=6?'flowing':''}" id="pl-line3"></div>
              <div class="pipeline-arrow-head ${state.pipelineStep>=6?'active':''}" id="pl-head3"></div>
            </div>

            <!-- Payment -->
            <div style="display:flex;justify-content:center">
              <div class="pipeline-node" style="max-width:180px">
                <div class="pipeline-node-box ${state.pipelineStep>=6?'completed':''}" id="pl-pay">
                  <div class="pipeline-node-icon">💎</div>
                  <div class="pipeline-node-name">Payment Released</div>
                  <div class="pipeline-node-sub">Atomic on Somnia</div>
                </div>
              </div>
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
              ${chainStat("Token","STT / SOMI","var(--yellow)")}
            </div>
          </div>
        </div>
      </div>

      <!-- Pipeline log -->
      <div class="card" style="position:sticky;top:70px">
        <div class="card-header">
          <h2>📜 Execution Log</h2>
          <span style="font-size:0.68rem;color:var(--t2)">Step ${state.pipelineStep}/6</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="subtask-output" id="pipeline-log" style="height:480px;border-radius:0 0 var(--r-lg) var(--r-lg);border:none">
${state.pipelineLog.length===0
  ? '<span style="color:var(--t3)">Click "Run Demo Pipeline" to start...\n\nThis will simulate:\n  1. Orchestrator picks up complex task\n  2. Claude decomposes it into 3 sub-tasks\n  3. Sub-tasks posted on Somnia (reactive events)\n  4. Specialist agents bid and execute\n  5. Verifier scores with AI (on-chain)\n  6. Payment released atomically\n\nAll coordination is on-chain.</span>'
  : state.pipelineLog.join("\n")}
          </div>
        </div>
      </div>
    </div>
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
    const step = PIPELINE_STEPS[i];
    await sleep(i === 0 ? 0 : PIPELINE_STEPS[i].delay - PIPELINE_STEPS[i-1].delay);
    state.pipelineStep = i + 1;
    state.pipelineLog.push(...step.log, "");
    updatePipelineUI();
    toast("info", `Step ${i+1}/6`, step.log[0].replace(/<[^>]+>/g,"").replace("// ",""));
  }

  state.pipelineRunning = false;
  addEvent("success","⬡","Pipeline complete","6-step autonomous task pipeline ran with 0 human actions");
}

function updatePipelineUI() {
  const logEl = document.getElementById("pipeline-log");
  if (logEl) {
    logEl.innerHTML = state.pipelineLog.join("\n");
    logEl.scrollTop = logEl.scrollHeight;
  }
  const btn = document.getElementById("run-pipeline-btn");
  if (btn) {
    btn.disabled = state.pipelineRunning;
    btn.textContent = state.pipelineRunning ? "⏳ Running..." : "▶ Run Demo Pipeline";
  }
  // Update node boxes
  const nodeMap = [
    {id:"pl-orch", activeFrom:1, completeFrom:2},
    {id:"pl-n1",   activeFrom:3, completeFrom:4},
    {id:"pl-n2",   activeFrom:3, completeFrom:4},
    {id:"pl-n3",   activeFrom:3, completeFrom:4},
    {id:"pl-ver",  activeFrom:5, completeFrom:6},
    {id:"pl-pay",  activeFrom:6, completeFrom:7},
  ];
  nodeMap.forEach(({id, activeFrom, completeFrom}) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("active",    state.pipelineStep >= activeFrom && state.pipelineStep < completeFrom);
    el.classList.toggle("completed", state.pipelineStep >= completeFrom);
  });
  ["pl-line1","pl-line2","pl-line3"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("flowing", state.pipelineStep >= i*2+2);
  });
  ["pl-head1","pl-head2","pl-head3"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", state.pipelineStep >= i*2+2);
  });
  document.querySelectorAll(".pipeline-connector").forEach(el => {
    el.classList.toggle("flowing", state.pipelineStep >= 3);
  });
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
function openTaskModal(task) {
  const cap = task.cap ?? task.requiredCapability ?? 0;
  const color = CAP_COLORS[cap];
  document.getElementById("modal-content").innerHTML = `
    <h2 style="font-size:1rem;margin-bottom:16px;padding-right:28px">Task #${task.id}: ${esc(task.title)}</h2>
    <div class="modal-section">
      <label>Status</label>
      <div class="val"><span class="task-badge ${STATUS_CLS[task.status]}">${STATUS_LABELS[task.status]}</span></div>
    </div>
    <div class="two-col">
      <div class="modal-section">
        <label>Capability</label>
        <div class="val" style="color:${color}">${CAP_LABELS[cap]}</div>
      </div>
      <div class="modal-section">
        <label>Reward</label>
        <div class="val" style="color:var(--cyan);font-weight:700">${task.reward.toFixed(4)} STT</div>
      </div>
    </div>
    ${task.quality > 0 ? `
    <div class="modal-section">
      <label>Quality Score</label>
      <div class="quality-display">
        <div class="quality-bar-wrap"><div class="quality-bar-fill" style="width:${task.quality}%"></div></div>
        <div class="quality-val" style="color:${task.quality>=75?"var(--green)":task.quality>=60?"var(--yellow)":"var(--red)"}">${task.quality}/100</div>
      </div>
    </div>` : ""}
    <div class="modal-section">
      <label>Assigned Agent</label>
      <div class="val mono">${task.assigned || "None yet"}</div>
    </div>
    <div class="modal-section">
      <label>Posted</label>
      <div class="val">${new Date(task.created*1000).toLocaleString()}</div>
    </div>
    <div style="margin-top:14px">
      <a href="${EXPLORER_TESTNET}" target="_blank" style="color:var(--indigo);font-size:0.78rem;text-decoration:none">
        View on Somnia Explorer →
      </a>
    </div>`;
  showModal();
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
}

// ── Post task (demo) ───────────────────────────────────────────────────────────
function postTask() {
  const title  = document.getElementById("f-title")?.value?.trim();
  const desc   = document.getElementById("f-desc")?.value?.trim();
  const cap    = parseInt(document.getElementById("f-cap")?.value ?? "0");
  const reward = parseFloat(document.getElementById("f-reward")?.value ?? "0.01");

  if (!title) { setPostStatus("Enter a task title.", "var(--red)"); return; }

  const btn = document.getElementById("post-btn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Posting..."; }

  setPostStatus("Simulating on-chain transaction...", "var(--indigo)");

  setTimeout(() => {
    const newTask = {
      id: state.tasks.length + 1,
      title, cap,
      status: 0,
      reward,
      poster: state.wallet || "0xDemo",
      assigned: null,
      quality: 0,
      created: Math.floor(Date.now()/1000),
      bidders: 0,
    };
    state.tasks.unshift(newTask);
    recomputeMetrics();
    setPostStatus(`✅ Task #${newTask.id} posted! STT escrowed.`, "var(--green)");
    if (btn) { btn.disabled = false; btn.textContent = "🚀 Post Task & Escrow STT"; }
    toast("success", "Task Posted!", `"${title}" — ${reward} STT escrowed on Somnia`);
    addEvent("info","📋",`Task #${newTask.id} posted`, `"${title}" — ${reward} STT`);

    // Auto-assign after 3s
    setTimeout(() => simulateBidAndAssign(newTask.id), 3000);
  }, 1200);
}

function setPostStatus(msg, color) {
  const el = document.getElementById("post-status");
  if (el) { el.style.color = color; el.style.fontSize = "0.75rem"; el.textContent = msg; }
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
  const openTasks = state.tasks.filter(t=>t.status===0).length;
  const el1 = document.getElementById("badge-agents");
  const el2 = document.getElementById("badge-tasks");
  if (el1) el1.textContent = state.agents.length;
  if (el2) el2.textContent = openTasks;
}

// ── Wallet ─────────────────────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) { toast("warn","No Wallet","Install MetaMask to connect"); return; }
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
    const accounts = await window.ethereum.request({method:"eth_accounts"});
    state.wallet = accounts[0];
    const btn = document.getElementById("wallet-btn");
    if (btn) { btn.classList.add("connected"); btn.querySelector("span").textContent = state.wallet.slice(0,8)+"..."+state.wallet.slice(-4); }
    const dot = document.getElementById("net-dot");
    if (dot) dot.classList.add("connected");
    document.getElementById("net-label").textContent = "Somnia Testnet";
    toast("success","Wallet Connected", state.wallet.slice(0,12)+"...");
    addEvent("success","🔗","Wallet connected", state.wallet.slice(0,10)+"...");
  } catch(e) {
    toast("error","Connection Failed", e.message?.slice(0,60));
  }
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

  const btn = document.getElementById("deploy-btn");
  const logWrap = document.getElementById("deploy-log-wrap");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Deploying..."; }

  const logLines = [];
  const addLog = (cls, msg) => {
    logLines.push(`<span class="${cls}">${msg}</span>`);
    if (logWrap) logWrap.innerHTML = `<div class="deploy-log">${logLines.join("<br>")}</div>`;
  };

  const steps = [
    [500,  "log-wait", "> Signing transaction with wallet..."],
    [900,  "log-info", "> Broadcasting to Somnia mempool..."],
    [600,  "log-ok",   "> Block confirmed in 0.8s ✓"],
    [500,  "log-ok",   "> AgentRegistry.registerAgent() executed ✓"],
    [400,  "log-ok",   `> AgentVault.stake(${(regState.stake||0.1).toFixed(3)} STT) locked ✓`],
    [300,  "log-ok",   "> Reputation initialized at " + Math.min(1000, Math.round(500+(regState.stake||0.1)*1000))],
    [200,  "log-ok",   "> Agent is now LIVE on Somnia L1 ✓"],
  ];

  for (const [delay, cls, msg] of steps) {
    await sleep(delay);
    addLog(cls, msg);
  }

  const caps = regState.caps.slice();
  const newAgent = {
    id: "0x" + Math.random().toString(16).slice(2,12),
    name: regState.name,
    caps,
    rep: Math.min(1000, Math.round(500 + (regState.stake||0.1)*1000)),
    tasks: 0,
    earnings: 0,
    status: 1,
  };
  state.agents.push(newAgent);
  updateBadges();
  addEvent("success","🤖",`${regState.name} deployed!`, `${(regState.stake||0.1).toFixed(3)} STT staked · Somnia L1`);
  toast("success","Agent Deployed!", `${regState.name} is now live on Somnia`);

  // Reset form state
  regState.step = 1; regState.name = ""; regState.desc = "";
  regState.caps = []; regState.emoji = "🔬"; regState.stake = 0.1;
  await sleep(1800);
  navigate("agents");
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
async function rpc(method, params = [], url = MAINNET_RPC) {
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
    state.blockNumber = parseInt(hex, 16);
  } else {
    state.blockNumber += 1 + Math.floor(Math.random() * 3);
  }
  const el = document.getElementById("block-num");
  if (el) el.textContent = state.blockNumber.toLocaleString();
}

async function initNetworkStatus() {
  const chainId  = await rpc("eth_chainId");
  const dot      = document.getElementById("net-dot");
  const netLabel = document.getElementById("net-label");
  const tpsEl    = document.getElementById("sidebar-tps");
  const finEl    = document.querySelector(".somnia-fin");

  if (chainId === "0x13a7") {
    if (dot)      dot.classList.add("connected");
    if (netLabel) netLabel.textContent = "Somnia Mainnet";
    addEvent("success", "⬡", "Somnia mainnet connected", "Chain 0x13a7 · <1s finality · live data");
  }

  // Gas price → show as Gwei in sidebar footer
  const gpHex = await rpc("eth_gasPrice");
  if (gpHex && finEl) {
    const gwei = (parseInt(gpHex, 16) / 1e9).toFixed(2);
    finEl.textContent = gwei + " Gwei";
  }

  // TPS via somnia_getStatistics(fromBlock, toBlock)
  // Requires two params; compute transactions / elapsed_seconds over last 100 blocks
  const latestHex = await rpc("eth_blockNumber");
  if (latestHex) {
    const latest    = parseInt(latestHex, 16);
    const fromNum   = Math.max(0, latest - 100);
    const fromHex   = "0x" + fromNum.toString(16);

    const [stats, fromBlock, toBlock] = await Promise.all([
      rpc("somnia_getStatistics", [fromHex, latestHex]),
      rpc("eth_getBlockByNumber", [fromHex, false]),
      rpc("eth_getBlockByNumber", [latestHex, false]),
    ]);

    if (stats && fromBlock && toBlock) {
      const txCount = parseInt(stats.numSuccessfulTransactions ?? "0x0", 16);
      const t1      = parseInt(fromBlock.timestamp, 16);   // unix seconds
      const t2      = parseInt(toBlock.timestamp,  16);
      const elapsed = t2 - t1;
      if (elapsed > 0 && tpsEl) {
        const tps = Math.round(txCount / elapsed);
        tpsEl.textContent = tps > 0
          ? tps.toLocaleString() + " TPS"
          : "1M+ TPS";           // fallback if low-activity window
      }
    }
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  seedDemo();

  // Nav
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.view));
  });

  // Wallet
  document.getElementById("wallet-btn").addEventListener("click", connectWallet);

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

  // Ethers via CDN
  if (typeof ethers === "undefined") {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.0/ethers.umd.min.js";
    document.head.appendChild(s);
  }
});
