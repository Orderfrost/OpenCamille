const layers = {
  surfaces: {
    title: "Surfaces",
    accent: "var(--blue)",
    role: "用户或外部入口。v0.1 只实现 CLI。",
    sections: {
      why: [
        "把交互方式和 Agent 运行逻辑拆开",
        "避免后续 Web/API/IDE 重复实现 provider、tools、recorder 业务逻辑",
        "保持 Surface 很薄，只负责交互，不拥有核心运行逻辑",
      ],
      responsibilities: [
        "读取用户输入",
        "解析 CLI flags",
        "把普通消息交给 Runtime Control",
        "把 slash command / 内部 command 交给 CommandDispatcher",
        "订阅 Lifecycle/EventBus 并渲染 model_delta streaming",
        "展示 tool status、approval prompt、final assistant message",
        "显示最终 assistant message，并把用户批准/拒绝传回 Runtime Control",
      ],
      v01Scope: [
        "CLI start -> load Config -> Runtime Control create/resume Session",
        "subscribe EventBus",
        "read user input -> Runtime Control handleInput()",
        "流式输出来自 Lifecycle/EventBus",
        "approval_requested -> CLI prompt user -> Runtime Control resolveApproval(allow/deny)",
        "Web 和 API 是长期架构入口，但不进入 v0.1",
      ],
      boundaries: [
        "不调用 providers",
        "不执行 tools",
        "不修改 ConversationHistory",
        "不直接写 Recorder 文件",
        "不持有 pendingApproval，审批状态属于 Runtime Control",
      ],
    },
  },
  runtime: {
    title: "Runtime Control",
    accent: "var(--cyan)",
    role: "live Session、ConversationHistory、审批状态和预算字段的所有者。",
    sections: {
      why: [
        "Agent Harness 最容易失控的地方是状态写入分散",
        "Runtime Control 收敛 ConversationHistory、pendingApproval、resume 入口",
        "AgentLoop 和 Tools 都不直接改 live Session",
      ],
      responsibilities: [
        "创建、恢复、关闭 Session",
        "写入 user / assistant / tool final messages",
        "维护 status、pendingApproval、budget / turnCount",
        "路由 command",
        "调用 AgentLoop",
        "处理 approval_required",
        "从 checkpoint rehydrate live Session",
      ],
      sessionShape: [
        "sessionId",
        "runId",
        "status: idle | running | waiting_approval | paused | finished | failed | cancelled",
        "conversationHistory: Message[]",
        "pendingApproval?: ApprovalRequest",
        "budget: maxTurns / turnCount",
        "sessionSummary?: string",
      ],
      boundaries: [
        "唯一写入 live ConversationHistory 的层",
        "v0.1 用一个 Session 对象，不拆 RunState / ApprovalState / BudgetState 类",
        "Recorder 记录和 checkpoint，不拥有 live state",
        "Agent Runtime 返回 turn result，不直接改 Session",
        "ContextManager 读取 session state，不修改它",
        "不组装 ContextAssembly，不调用 LLM API，不执行 tool callable",
      ],
      acceptance: [
        "Runtime Control 是 ConversationHistory 唯一写入者",
        "approval_required 能暂停并恢复同一个 tool call",
        "checkpoint 能恢复出 live Session",
        "CommandDispatcher 不被放入 Agent Services",
      ],
    },
  },
  agent: {
    title: "Agent Runtime",
    accent: "var(--amber)",
    role: "执行模型和工具循环，返回 turn result，不直接修改 live Session。",
    sections: {
      why: [
        "v0.1 的真实复杂度还不需要 ToolExecutor / ExecutionStrategy / TerminationGuard",
        "先把 build context -> call model -> handle tool use -> append result -> repeat 写清楚",
        "避免过早拆分导致空模块和控制流分散",
      ],
      responsibilities: [
        "ContextManager.build(session)",
        "ProviderAdapter.stream(context)",
        "接收厂商无关 stream items",
        "emit model/tool/turn lifecycle events",
        "聚合 model_delta 成 final assistant message",
        "处理 tool_use",
        "调用 Tools.runToolCall(toolUse)",
        "context_overflow 时 compact 一次并 retry 一次",
        "inline 检查 max turns、budget、abort signal",
      ],
      loopContract: [
        "build context",
        "如果 context_overflow，Memory.compact() 后 rebuild once",
        "stream provider-neutral items",
        "tool_use 时发 tool_requested 并调用 Tools.runToolCall",
        "approval_required 时把 pending approval 返回 Runtime Control",
        "没有 tool_use 时返回 final assistant message",
      ],
      boundaries: [
        "不新增 ToolExecutor / ExecutionStrategy / TerminationGuard",
        "只由 AgentLoop 发 turn/model/tool lifecycle events",
        "approval_required 时把控制权还给 Runtime Control",
        "不写 Recorder 文件，不等待用户审批",
        "不实现 provider SDK 细节，不注册/扫描 tools，不扫描 skills",
      ],
      acceptance: [
        "AgentLoop 不直接写 Session",
        "ContextManager 不调用 provider",
        "context_overflow 只 compact once + retry once",
        "Provider-specific 结构不泄漏进 AgentLoop",
      ],
    },
  },
  services: {
    title: "Services",
    accent: "var(--rose)",
    role: "Harness 能力层，位于 raw infrastructure 之上。",
    sections: {
      why: [
        "Services 承载 Harness 能力，但不拥有 live Session",
        "Agent Services 提供 Tools / Skills / Memory / MCP",
        "Runtime Services 提供 Lifecycle / Hooks / Plugins / Recorder",
      ],
      agentServices: [
        "Tools: register / list schemas / resolve / runToolCall",
        "Skills: SkillIndex + built-in Skill tool",
        "Memory: SessionSummary + PersistentMemory",
        "MCP: stdio tools adapted into Tools",
        "Subagents: 顶级架构保留，v0.1 不实现",
      ],
      runtimeServices: [
        "Lifecycle owns event names and EventBus",
        "Hooks are fixed hook points, not only EventBus subscribers",
        "Plugins stay local and minimal in v0.1",
        "Recorder writes events.jsonl / transcript.jsonl / checkpoint.json",
      ],
      toolPath: [
        "validate args with zod",
        "ask PermissionEngine",
        "return approval_required if ask",
        "execute callable if allow",
        "normalize / truncate / redact result",
        "return ok or error",
      ],
      forbidden: [
        "Tools 不修改 ConversationHistory",
        "Tools 不等待用户 approval",
        "Tools 不调用 LLM provider",
        "Recorder 不恢复 live state by event sourcing",
        "Hooks 中只有少数点可 block/modify，其余只观察",
        "不做 plugin manifest / marketplace / remote install / dependency solver / plugin sandbox",
      ],
    },
  },
  infra: {
    title: "Infrastructure",
    accent: "var(--purple)",
    role: "底层适配器、安全边界和 Node 标准库附近的小能力。",
    sections: {
      why: [
        "隔离外部系统差异和副作用风险",
        "把 provider、config、permission、MCP transport、command、path boundary 固定在底层",
        "读写文件可以直接用 Node fs/promises，但路径必须先过 WorkspacePath",
      ],
      responsibilities: [
        "ProviderAdapter hides provider-specific SDK/API formats",
        "Config loads env/config and applies deterministic precedence",
        "PermissionEngine returns allow | ask | deny",
        "MCPClient handles stdio JSON-RPC",
        "CommandRunner and WorkspacePath stay as small safety functions",
      ],
      providerContract: [
        "Input: provider-neutral ContextAssembly",
        "Output: model_delta | tool_use | final_message | usage | error",
        "需要一个真实 provider，也需要 fake provider 支撑 AgentLoop 单测",
      ],
      safetyDetails: [
        "Config precedence: built-in defaults -> env -> user config -> project config -> CLI flags",
        "CommandRunner: timeout、abort signal、stdout/stderr limits、exit code normalization",
        "WorkspacePath: path normalization and workspace boundary checks",
        "PermissionEngine 不等待用户，不存 approval state",
      ],
      boundaries: [
        "不新增 FileSystem / Shell class / Storage abstraction",
        "不新增 Sandbox / ProviderFactory / PolicyStore",
        "不新增 SecretsManager / NetworkClient",
        "secrets never enter Recorder output",
        "Provider-specific stream/tool shapes 不泄漏到 AgentLoop",
      ],
    },
  },
};

const sectionLabels = {
  why: "为什么需要",
  responsibilities: "职责",
  v01Scope: "v0.1 路径",
  boundaries: "边界",
  sessionShape: "Session 形状",
  acceptance: "验收标准",
  loopContract: "循环契约",
  agentServices: "Agent Services",
  runtimeServices: "Runtime Services",
  toolPath: "Tool path",
  forbidden: "不能做",
  providerContract: "Provider contract",
  safetyDetails: "安全细节",
};

const root = document.documentElement;
const progress = document.querySelector(".progress-bar");
const sidebar = document.querySelector(".sidebar");
const navToggle = document.querySelector(".mobile-nav-toggle");
const navItems = [...document.querySelectorAll(".nav-item")];
const sections = navItems
  .map((item) => document.querySelector(item.getAttribute("href")))
  .filter(Boolean);
const panel = document.querySelector(".layer-detail-panel");
const overlay = document.querySelector(".layer-detail-overlay");
const backToTop = document.querySelector(".back-to-top");

root.dataset.architecture = "2026-06-29";
root.dataset.theme = localStorage.getItem("architecture-theme") || "light";

document.querySelector(".theme-toggle")?.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("architecture-theme", root.dataset.theme);
});

navToggle?.addEventListener("click", () => {
  const open = !sidebar.classList.contains("is-open");
  sidebar.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
});

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    navToggle?.setAttribute("aria-expanded", "false");
  });
});

function syncScrollState() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = max > 0 ? `${(window.scrollY / max) * 100}%` : "0";
  backToTop.classList.toggle("is-visible", window.scrollY > 500);

  const active = [...sections]
    .reverse()
    .find((section) => section.getBoundingClientRect().top <= 120);
  navItems.forEach((item) => {
    item.classList.toggle("is-active", active && item.getAttribute("href") === `#${active.id}`);
  });
}

window.addEventListener("scroll", syncScrollState, { passive: true });
syncScrollState();

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function renderSection(title, items) {
  return `
    <section class="detail-section">
      <h3>${sectionLabels[title] || title}</h3>
      <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
    </section>
  `;
}

function openLayer(key) {
  const layer = layers[key];
  if (!layer) return;

  document.querySelectorAll(".layer-row").forEach((row) => {
    row.classList.toggle("is-active", row.dataset.layer === key);
  });

  panel.querySelector(".header-accent").style.background = layer.accent;
  panel.querySelector("h2").textContent = layer.title;
  panel.querySelector(".header-role").textContent = layer.role;
  panel.querySelector(".detail-body").innerHTML = Object.entries(layer.sections)
    .map(([title, items]) => renderSection(title, items))
    .join("");

  overlay.classList.add("is-open");
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  panel.querySelector(".detail-close").focus();
}

function closeLayer() {
  overlay.classList.remove("is-open");
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  document.querySelectorAll(".layer-row").forEach((row) => {
    row.classList.remove("is-active");
  });
}

document.querySelectorAll(".layer-row").forEach((row) => {
  row.addEventListener("click", () => openLayer(row.dataset.layer));
});

document.querySelectorAll("[data-close-layer]").forEach((button) => {
  button.addEventListener("click", closeLayer);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLayer();
});
