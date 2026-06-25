# OpenCamille 架构文档

> 状态: 已澄清 | 日期: 2025-06-26
>
> 本文档记录 OpenCamille Agent Harness 的顶层架构设计。
> 经验证通过 Claude Code / OpenClaw / Codex 三大参考项目交叉对比。
> 验证报告见 `docs/research/architecture-verification.md`。

---

## 1. 定位

**OpenCamille = Agent Harness（Agent 运行时框架）**

| | Harness（框架） | Agent（实例） |
|---|---|---|
| 职责 | 提供 Agent 运行所需的基础设施 | 执行具体任务 |
| 内容 | 会话管理、工具、权限、记忆、模型适配 | System Prompt、工具集、行为规则 |

**核心抽象**：Harness 是一套基础设施，Agent 是运行其上的能力实体。
**1 Session = 1 Agent（主 Agent）**，Agent 可 spawn 子 Agent，可切换 Skill 改变能力。

---

## 2. 整体分层（5 层 + 横切模块）

```
1. Interface        用户交互 + 命令路由
2. Session          会话容器 · 生命周期 · 对话历史 owner
3. Agent            能力实体 · Agent Loop · Skill 切换 · 子 Agent
4. Service          工具系统 · 权限引擎 · MCP 接入
5. Infrastructure   基础能力 · 可替换 · 独立可测

横切模块:
  Lifecycle   · ContextManager   · SkillLoader
```

### 依赖规则

- **正向依赖**: Interface → Session → Agent → Service → Infrastructure
- **跨层依赖**（显式声明）:
  - Agent → Infra.ProviderAdapter（模型调用直达）
  - Agent → Infra.MemoryStore（上下文组装）
  - Session → Infra.SessionStore（会话持久化）
  - MemoryStore ← Session.ConversationHistory（反向只读数据流）
- **横切模块**：无层限制

---

## 3. 各层设计

### 3.1 Interface 层

**职责**: 用户输入捕获、输出渲染、命令路由。

```
Interface 层:
  ├── Input Capture      CLI(stdin) / Web(HTTP)
  ├── Output Render      TUI(ink) / Web(SSE)
  ├── CommandRouter      解析 / 前缀 → 路由到 harness / agent / skill
  └── Multi-Interface    多个界面订阅同一 Session
```

**命令分类**:

| 类别 | 例子 | 行为 | 入对话历史 |
|------|------|------|-----------|
| harness | /exit, /pause, /clear | Interface 直接处理 | 否 |
| agent | /goal "...", /mode ... | 注入 Agent 对话 | 是 |
| skill | /code-review | 调用 SkillLoader | 是 |

**Session 访问**: Interface 通过 Infra.SessionRegistry 获取 Session 引用。先单进程内存，预留跨进程。

**数据通道**: Interface ↔ Session 之间是两条独立单向通道：

```
输入: Interface → Session.handleInput() / session.approve() / session.reject()
输出: Agent.run() → AsyncGenerator<StreamEvent>（流式文本）
      Lifecycle.after → 状态通知（所有界面共享）
```

---

### 3.2 Session 层

**职责**: 会话容器、对话历史所有者、生命周期管理。

```
Session:
  ├── ConversationHistory  Message[] 唯一所有者
  ├── Lifecycle State      idle → active → paused → ended
  ├── Agent Reference      持有当前 Agent 实例引用
  ├── Agent Swap           运行时替换 Agent（保留对话历史）
  ├── Skill Loading        加载/卸载 Skill 能力包
  └── Persistence          触发 Infra.SessionStore（每轮结束追加 JSONL）
```

**状态机（4 状态）**:

```
idle → active → paused → ended
         ↑         │
         └─────────┘
```

**Agent 内部等待（阻塞调用，不改变 Session 状态）**:

| 场景 | 机制 |
|------|------|
| 权限确认 | `session.waitForApproval(prompt)` 阻塞 Agent Loop → 弹确认 UI → resolve |
| Agent 问用户 | `session.waitForUserInput(prompt)` 阻塞 → 等输入 |
| Plan 审阅 | `session.waitForPlanApproval(plan)` 阻塞 → 确认/拒绝 |

**Agent 替换**: Session 可换 Agent 实例（保留对话历史），通过 Skill 切换实现——L1 身份不变，L2 能力变更，保持 Token 缓存命中率。

**对话历史持久化**: 每轮 Agent Loop 结束追加到 Infra.SessionStore（JSONL 文件）。

---

### 3.3 Agent 层

**职责**: Agent 实体定义 + Agent Loop 驱动 + 子 Agent 管理 + Skill 切换。

```
Agent 层:

  ┌── Agent 定义 ─────────────────────────────┐
  │                                            │
  │  Agent 实例（创建时传入，运行时可变）:        │
  │    identity:   { name, systemPrompt }       │
  │    tools:      Tool[]                       │
  │    model:      ModelConfig                  │
  │    rules:      Rule[]                       │
  │    skills:     Skill[]    （当前激活能力集）  │
  │    state:      { mode, turns, tokens }      │
  │                                            │
  │  AgentFactory: config → Agent 实例          │
  │                                            │
  └────────────────────────────────────────────┘

  ┌── Agent 执行 ─────────────────────────────┐
  │                                            │
  │  Agent Loop（纯 while 循环）:               │
  │    每轮:                                    │
  │      ContextManager.assemble(agent, sess)  │
  │      → ThinkStep（模型调用）                 │
  │      → GuardStep（终止检查）                 │
  │      → ActStep（工具执行，Promise.all）      │
  │      → ObserveStep（写入 session.messages）  │
  │      → TerminateStep（判断停止）              │
  │                                            │
  │  ThinkStep 细节:                             │
  │    • 文本 + tool_calls 完整保留到 messages   │
  │    • thinking 默认折叠，可配置 visible       │
  │    • 无 tool_calls 时跳过 ActStep            │
  │                                            │
  │  GuardStep（精简版）:                        │
  │    1. finish_reason === "stop" → 正常结束   │
  │    2. Token/Cost budget 耗尽 → 强制终止     │
  │    3. ExactRepeat: 同工具+同参数 连续 5 次   │
  │       → loop detected → 终止               │
  │                                            │
  │  ModeSwitcher:                              │
  │    • default (ReAct)                        │
  │    • plan-and-solve                         │
  │      ├── plan-mode: 输出计划，不调工具       │
  │      ├── Todo 工具: 管理子目标完成状态        │
  │      ├── approval: auto / user              │
  │      └── execute: 逐个 Run 子目标到同一       │
  │          Session.messages                   │
  │                                            │
  └────────────────────────────────────────────┘

  ┌── 子 Agent（Hub-and-Spoke）────────────────┐
  │                                            │
  │  mainAgent.spawn({                         │
  │    systemPrompt, tools, model, rules       │
  │  })                                        │
  │                                            │
  │  约束:                                      │
  │    • 独立 AgentLoop 实例                     │
  │    • 独立上下文窗口（Context Rot 隔离）        │
  │    • 不拥�� Task 工具（防深层嵌套）            │
  │    • 完成后返回摘要到主 Agent                 │
  │    • 权限 ≤ 主 Agent（bubble 继承）           │
  │                                            │
  └────────────────────────────────────────────┘
```

**Agent 切换 = Skill 切换**:

```
L1 基础身份: 始终不变（缓存保留）
L2 动态能力: SkillLoader.load("code-review") → 注入提示
L3 记忆: 按需加载
```

行为由模块交叉决定，支持 Preset 预设：

```
Preset "cautious":
  ├── permission: ask mode
  ├── mode: plan-and-solve
  └── prompt tone: 解释每个决策
```

---

### 3.4 Service 层

**职责**: 工具管理与执行、权限控制、外部工具接入。

```
Service 层:

  ToolRegistry
    ├── read_file, write_file, shell_exec
    ├── agent_task (spawn 子 Agent)
    ├── Todo (plan-and-solve 子目标管理)
    └── MCP:* (通过 MCPToolAdapter 接入)

  ToolDef: { name, description, inputSchema: ZodType }
    一个 zod → TS 类型 + LLM JSON Schema + 运行时校验
    工具执行结果: 纯字符串

  PermissionEngine (Deny-first)
    ├── deny → ask → allow（顺序匹配）
    ├── 三级: safe(allow) / write(ask) / dangerous(deny)
    └── Session 记忆用户选择
    作为 Lifecycle.tool.pre 的内置 before-handler
```

---

### 3.5 Infrastructure 层

**职责**: 所有可替换的基础能力。

```
Infrastructure:

  Lifecycle             统一生命周期系统（before/after 回调）
  ProviderAdapter       Anthropic/OpenAI SDK 翻译
  MemoryStore           3-tier 记忆 + CompactionAgent
  ConfigLoader          分层配置（主文件 + 独立文件 + env）
  SessionStore          会话持久化: JSONL(messages) + JSON(state)
  TraceStore            Span 级 Tracing + Token 计数（OpenTelemetry）
  MCPClient             MCP 协议传输（stdio/HTTP）
  SkillLoader           Skill 包加载（Anthropic L1/L2/L3 标准）
  CommandRegistry       命令定义 + category + availableIn
  SessionRegistry       Session 查找（内存 + 未来跨进程）
```

**MemoryStore（3-tier）**:

| 层 | 内容 | 来源 |
|----|------|------|
| Working | Session.messages 窗口引用 | Session |
| Compressed | CompactionAgent 生成摘要 | LLM (haiku) |
| Persistent | 关键事实 → ~/.opencamille/memory/*.md | 事实提取 |

MemoryStore 不持有原始 Message[] 副本，只存储**衍生品**。

---

## 4. 横切模块

### Lifecycle（统一生命周期）

**设计来源**: Claude Code Hooks + OpenClaw Plugin Hooks + OpenCode Events。

单个机制统一了之前的 InterceptorChain + Hook + EventBus。

```
Lifecycle 节点树:
  session.*  |  agent.*  |  turn.*  |  tool.*  |  subagent.*  |  memory.*

  before 回调: 可 block · modify · allow
  after 回调:  只观察 · fire-and-forget

  决策优先级: deny > ask > allow（一个 deny 拒绝所有）

  内置 handler:
    PermissionEngine → tool.pre（deny/ask/allow）
    LoopGuard        → tool.pre（重复检测 → deny）
    TraceStore       → tool.post, turn.end（Span 记录）
```

### ContextManager

**位置**: Agent 层每轮 Think 前调用，横切聚合。

**职责**: 组装 Prompt，适配不同厂商 API（Anthropic 的 system[] + messages vs OpenAI 的 role:"system" messages）。

```
输入:
  ├── Agent 身份定义
  ├── 规则文件（User/Project，从文件系统读取，优先级: User > Project > Skill > Default）
  ├── Skill 片段（L1 元数据 → 上下文，L2 body → 身份层）
  ├── 工具快照（从 Service.ToolRegistry）
  └── 记忆（从 MemoryStore）

输出: ContextAssembly {
  system:     string    ← 身份层（Agent identity + L2 Skill + 安全规则）
  reminders:  string[]  ← 规则层（User/Project rules）
  tools:      ToolDef[]
  messages:   Message[]
}

ProviderAdapter 翻译:
  Anthropic: system → system[], reminders → messages 的 <system-reminder>
  OpenAI:    system + reminders → role:"system" message
```

### SkillLoader

**位置**: Infrastructure 层，横跨 Service + Agent。严格遵循 Anthropic Skill 标准。

```
Skill 结构:
  skill-name/
  ├── SKILL.md            # YAML frontmatter + Markdown body
  ├── scripts/            # 可执行脚本
  ├── references/         # 参考文档（按需加载）
  └── assets/             # 输出资源

三层渐进式加载:
  L1: name + description — 会话启动始终加载 (~100 tokens/skill)
  L2: SKILL.md body — 触发时加载 (<500 行)
  L3: references/ — Agent 按需 read_file
```

---

## 5. 数据流

### 主数据流（同步）

```
Interface → Session.handleInput()
  → Agent.run(input, sessionCtx)
    → ContextManager.assemble()
    → ThinkStep → Infra.ProviderAdapter.chat()
        → StreamEvent → Interface 实时渲染
    → GuardStep → 终止检查
    → ActStep → Lifecycle.before(tool.pre) → Tool.execute()
    → ObserveStep → Session.messages.append()
    → TerminateStep → done?
```

### 通知流（异步 — Lifecycle after 回调）

```
Lifecycle.after 消费者:
  TraceStore  ← tool.post, turn.end（Span 记录）
  TUI panels  ← turn.end（界面刷新）
  Hook 脚本   ← turn.end, session.end（自定义逻辑）
  Plugin      ← 任意节点（扩展功能）
```

---

## 6. 存储布局

```
~/.camille/
  ├── config.json
  ├── permissions.json
  ├── hooks.json
  ├── memory/              # 持久记忆
  ├── sessions/            # 会话持久化
  │   └── {sessionId}/
  │       ├── state.json
  │       ├── messages.jsonl
  │       └── checkpoints/
  └── traces/              # Eval 链路
```

---

## 7. 参考项目

- **Claude Code**: queryLoop、deny-first 权限、hub-and-spoke 子 Agent、CLAUDE.md、Skills
- **OpenClaw**: Plan-Review-Execute 三阶段、Session 状态机、goal-task 循环
- **Codex/Cursor**: shell-centric 工具哲学、推理链保留
- **OpenCode**: PRUNE 双阈值、Compaction Agent、Plugin SDK
