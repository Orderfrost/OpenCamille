/* ═══════════════════════════════════════════════════════════
   OpenCamille Architecture — Interactive Features
   ═══════════════════════════════════════════════════════════ */

// ── Layer detail data ──────────────────────
const LAYER_DATA = {
  interface: {
    title: 'Interface',
    role: '用户输入捕获、输出渲染、命令路由。',
    sections: [
      {
        heading: '模块',
        items: [
          'Input Capture — CLI(stdin) / Web(HTTP)',
          'Output Render — TUI(ink) / Web(SSE)',
          'CommandRouter — 解析 / 前缀，路由到 harness / agent / skill',
          'Multi-Interface — 多个界面订阅同一 Session',
        ]
      },
      {
        heading: '命令分类',
        items: [
          'harness: /exit, /pause, /clear — Interface 直接处理，不入对话历史',
          'agent: /goal "...", /mode ... — 注入 Agent 对话，入对话历史',
          'skill: /code-review — 调用 SkillLoader，入对话历史',
        ]
      },
      {
        heading: '数据通道',
        items: [
          '输入（单向）: Interface → Session.handleInput() / approve() / reject()',
          '输出（单向）: Agent.run() → AsyncGenerator<StreamEvent> 流式文本',
          '状态事件（广播）: EventBus → 所有界面共享',
        ]
      },
    ],
    deps: '↓ Session',
  },
  session: {
    title: 'Session',
    role: '会话容器、对话历史所有者、生命周期管理。',
    sections: [
      {
        heading: '核心职责',
        items: [
          'ConversationHistory — Message[] 唯一所有者，MemoryStore 只读引用不持副本',
          'Lifecycle State — idle → active → paused → ended 四状态机',
          'Agent Reference — 持有当前 Agent 实例引用，可运行时替换',
          'Persistence — 每轮 Agent Loop 结束追加到 Infra.SessionStore (JSONL)',
        ]
      },
      {
        heading: 'Agent 内部等待（不改变 Session 状态）',
        items: [
          'waitForApproval(prompt) — 权限确认，阻塞 Agent Loop，弹确认 UI',
          'waitForUserInput(prompt) — Agent 问用户，等待输入',
          'waitForPlanApproval(plan) — Plan 审阅，确认/拒绝',
        ]
      },
      {
        heading: 'Agent 替换 = Skill 切换',
        items: [
          '不换 L1 身份（Token 缓存保留），换 L2 能力注入',
          '运行时加载/卸载 Skill，保留完整对话历史',
        ]
      },
    ],
    deps: '↓ Agent · Infra.SessionStore',
  },
  agent: {
    title: 'Agent',
    role: 'Agent 实体定义 + Agent Loop 驱动 + 子 Agent 管理 + Skill 切换。核心层。',
    sections: [
      {
        heading: 'Agent 定义',
        items: [
          'identity: { name, systemPrompt } — L1 稳定，创建时传入',
          'tools: Tool[] — 从 Service.ToolRegistry 选取',
          'model: ModelConfig — 从 Config 读取，CLI 可覆盖',
          'rules: Rule[] — 从 Infra.RuleLoader 加载',
          'skills: Skill[] — 当前激活能力集（可增删，L2 变化）',
        ]
      },
      {
        heading: 'Agent Loop（纯 while 循环）',
        items: [
          'ContextManager.assemble(agent, session) — 三层聚合上下文',
          'ThinkStep — Infra.ProviderAdapter.chat() 模型调用',
          'GuardStep — 终止检查: finish_reason stop / budget 耗尽 / ExactRepeat 5x',
          'ActStep — 无 tool_calls 跳过，有则 InterceptorChain → Promise.all 执行',
          'ObserveStep — 工具结果写入 Session.messages',
          'TerminateStep — 判断是否结束，否则继续下一轮',
        ]
      },
      {
        heading: 'ModeSwitcher',
        items: [
          'default (ReAct): Think → Act → Observe 直行',
          'plan-and-solve: 先输出计划 → Plan approval → 逐子目标执行',
        ]
      },
    ],
    deps: '↓ Service · Infra.ProviderAdapter · Infra.MemoryStore',
  },
  service: {
    title: 'Service',
    role: '工具管理与执行、权限控制、外部工具接入。',
    sections: [
      {
        heading: 'ToolRegistry',
        items: [
          'read_file — 读取文件内容',
          'write_file — 写入文件',
          'shell_exec — 执行 shell 命令',
          'agent_task — spawn 子 Agent',
          'Todo — plan-and-solve 子目标管理',
          'MCP:* — 通过 MCPToolAdapter 接入外部工具',
        ]
      },
      {
        heading: 'ToolDef（一份 zod 三用）',
        items: [
          '编译时 TypeScript 类型推导',
          '运行时参数校验 (zod parse)',
          'LLM JSON Schema 生成（函数调用描述）',
          '工具执行结果: 纯字符串',
        ]
      },
      {
        heading: 'PermissionEngine (Deny-first)',
        items: [
          '评估顺序: deny rules → ask rules → allow rules（deny 永远覆盖 allow）',
          'safe: allow（read_file, search）',
          'write: ask（write_file, edit）— 首次后 session 记忆',
          'dangerous: deny（shell_exec, delete, http_post）— 用户显式 allow',
        ]
      },
    ],
    deps: '↓ Infrastructure',
  },
  infrastructure: {
    title: 'Infrastructure',
    role: '所有可替换、可独立测试的基础能力。底层无依赖。',
    sections: [
      {
        heading: '核心模块',
        items: [
          'Lifecycle — 统一生命周期系统，before/after 回调，节点树覆盖 session/agent/turn/tool/subagent/memory',
          'ProviderAdapter — Streaming 归一化（Anthropic/OpenAI → StreamEvent），自定义通用 Message 格式',
          'MemoryStore — 3-Tier: Working + Compressed（CompactionAgent, Haiku）+ Persistent',
          'ConfigLoader — 优先级: 内置默认 → ~/.camille/config.json → ./camille.json → CLI → env',
          'SessionStore — ~/.camille/sessions/{id}/: state.json + messages.jsonl + checkpoints/',
          'TraceStore — OpenTelemetry 标准 Span 嵌套: turn.think → turn.act.shell_exec',
        ]
      },
      {
        heading: '扩展模块',
        items: [
          'MCPClient — MCP 协议传输（stdio/HTTP）',
          'SkillLoader — Anthropic 标准: L1 元数据始终加载 → L2 触发注入 → L3 按需读取',
          'CommandRegistry — 命令定义 + category + availableIn',
          'SessionRegistry — Session 查找（内存 + 未来跨进程）',
        ]
      },
    ],
    deps: '↓ 无（底层）',
  },
};

// ── Progress Bar ───────────────────────────
(function() {
  const bar = document.getElementById('progressBar');
  if (!bar) return;

  function update() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
    bar.style.width = pct + '%';
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();

// ── Back to Top ─────────────────────────────
(function() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;

  function update() {
    const heroBottom = document.querySelector('.hero')?.getBoundingClientRect().bottom ?? 0;
    btn.classList.toggle('is-visible', heroBottom < 0);
  }

  window.addEventListener('scroll', update, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// ── Theme toggle ───────────────────────────
(function() {
  const toggle = document.getElementById('themeToggle');
  const html = document.documentElement;

  const saved = localStorage.getItem('oc-arch-theme');
  if (saved) html.setAttribute('data-theme', saved);

  toggle.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('oc-arch-theme', next);
  });
})();

// ── Mobile nav toggle ──────────────────────
(function() {
  const toggle = document.getElementById('mobileNavToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('is-open');
  });

  // Close sidebar when clicking a nav link (mobile)
  sidebar.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('is-open');
    });
  });

  // Close on overlay click (we use a simple approach: click main content)
  document.querySelector('.main').addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) {
      sidebar.classList.remove('is-open');
    }
  });
})();

// ── Scroll spy ─────────────────────────────
(function() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = [];

  navItems.forEach(link => {
    const id = link.getAttribute('data-section');
    const el = document.getElementById(id);
    if (el) sections.push({ id, el, link });
  });

  function update() {
    const scrollY = window.scrollY + 140;

    let current = sections[0];
    for (const s of sections) {
      if (s.el.offsetTop <= scrollY) current = s;
    }

    navItems.forEach(link => link.classList.remove('is-active'));
    if (current) current.link.classList.add('is-active');
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();

// ── Layer accent colors ────────────────────
const LAYER_ACCENTS = {
  interface:   { accent: 'var(--blue)',   bg: 'var(--blue-bg)' },
  session:     { accent: 'var(--cyan)',   bg: 'var(--cyan-bg)' },
  agent:       { accent: 'var(--amber)',  bg: 'var(--amber-bg)' },
  service:     { accent: 'var(--rose)',   bg: 'var(--rose-bg)' },
  infrastructure: { accent: 'var(--purple)', bg: 'var(--purple-bg)' },
};

// ── Layer detail panel ─────────────────────
(function() {
  const overlay = document.getElementById('layerDetailOverlay');
  const panel = document.getElementById('layerDetailPanel');
  const headerEl = document.getElementById('detailHeader');
  const bodyEl = document.getElementById('detailBody');
  const closeBtn = document.getElementById('detailClose');
  const expandBtns = document.querySelectorAll('.layer-expand');
  const layerRows = document.querySelectorAll('.layer-row');

  function open(layerName) {
    const data = LAYER_DATA[layerName];
    if (!data) return;
    const colors = LAYER_ACCENTS[layerName] || LAYER_ACCENTS.interface;

    // Header
    const accentBar = headerEl.querySelector('.header-accent');
    const titleEl = headerEl.querySelector('h3');
    const roleEl = headerEl.querySelector('.header-role');
    accentBar.style.background = colors.accent;
    titleEl.textContent = data.title;
    roleEl.textContent = data.role;

    // Body — force reflow to replay staggered animation
    bodyEl.innerHTML = '';
    void bodyEl.offsetHeight;
    let html = '';
    data.sections.forEach(sec => {
      html += `<div class="detail-section"><h4>${sec.heading}</h4><ul>`;
      sec.items.forEach(item => { html += `<li>${item}</li>`; });
      html += '</ul></div>';
    });
    html += `<div class="detail-deps">Dependencies: ${data.deps}</div>`;
    bodyEl.innerHTML = html;
    bodyEl.style.setProperty('--li-accent', colors.accent);

    overlay.classList.add('is-open');
    panel.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    layerRows.forEach(r => r.classList.remove('is-active'));
    const targetRow = document.querySelector(`.layer-row[data-layer="${layerName}"]`);
    if (targetRow) targetRow.classList.add('is-active');

    // Scroll panel to top
    panel.scrollTop = 0;
  }

  function close() {
    overlay.classList.remove('is-open');
    panel.classList.remove('is-open');
    document.body.style.overflow = '';
    layerRows.forEach(r => r.classList.remove('is-active'));
  }

  expandBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      open(btn.getAttribute('data-layer'));
    });
  });

  layerRows.forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      if (e.target.closest('.layer-expand')) return;
      if (e.target.closest('.mod-chip') || e.target.closest('.loop-step')) return;
      open(row.getAttribute('data-layer'));
    });
  });

  overlay.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
  });
})();

// ── Intersection Observer for entrance ─────
(function() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .reveal { opacity: 0; }
    .reveal.visible { animation: fadeUp 550ms cubic-bezier(0.2, 0, 0, 1) both; }
  `;
  document.head.appendChild(style);

  const targets = document.querySelectorAll(
    '.section, .layer-diagram, .cross-grid, .flow-block, .memory-grid, .dep-table, .storage-tree'
  );
  targets.forEach(el => el.classList.add('reveal'));

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });

  targets.forEach(el => obs.observe(el));
})();
