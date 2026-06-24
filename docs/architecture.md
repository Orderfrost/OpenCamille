# OpenCamille 架构文档

> 状态: 已澄清 | 日期: 2025-06-24
>
> 本文档记录 OpenCamille Agent Harness 的顶层架构设计。
> 经验证通过 Claude Code / OpenClaw / Codex 三大参考项目交叉对比。
> 模块级实现细节见 [`architecture-modules.md`](architecture-modules.md)。
> 验证报告见 `docs/research/architecture-verification.md`。

---

## 1. 定位

**OpenCamille = Agent Harness（Agent 运行时框架）**

| | Harness（框架） | Agent（实例） |
|---|---|---|
| 职责 | 提供 Agent 运行所需的基础设施 | 执行具体任务 |
| 内容 | 会话管理、工具、权限、记忆、模型适配 | System Prompt、能力集、行为规则 |
| 类比 | 操作系统 | 运行在 OS 上的程序 |

**核心抽象**：Harness 是一套基础设施，Agent 是运行其上的能力实体。
**1 Session = 1 Agent（主 Agent）**，主 Agent 可 spawn 子 Agent。

---

## 2. 整体分层（5 层 + 横切模块）

```
1. Interface       用户交互 + 命令路由
2. Session         会话容器 · 生命周期 · 对话历史
3. Agent           能力实体 · Agent Loop · 子 Agent 管理
4. Execution       工具系统 · 权限引擎 · MCP 接入
5. Infrastructure  基础能力 · 可替换 · 独立可测

横切模块:
  ContextManager   · InterceptorChain   · EventBus   · SkillLoader
```

### 依赖规则

- **正向依赖**（默认允许）: Interface → Session → Agent → Execution → Infrastructure
- **跨层依赖**（显式声明即允许）:
  - Agent → Infrastructure.ProviderAdapter（模型调用直达）
  - Agent → Infrastructure.MemoryStore（上下文组装需要记忆）
  - Session → Infrastructure.SessionStore（会话持久化）
  - MemoryStore ← Session.ConversationHistory（只读引用，反向数据流）
- **横切模块**（无层限制）: ContextManager、InterceptorChain、EventBus、SkillLoader

---

## 3. 各层设计

### 3.1 Interface 层

**职责**: 用户输入捕获、输出渲染、命令路由。

```
Interface 层:
  ├── Input Capture      CLI(stdin) / Web(HTTP/WS)
  ├── Output Render      TUI(ink) / Web(SSE)
  ├── Command Router     解析 / 前缀 → harness命令 / skill / 用户消息
  └── Multi-Interface    多个界面订阅同一 Session
```

**命令系统**:
- CommandRegistry 在 Infrastructure 定义所有命令，标记 `availableIn: ["CLI", "Web"]`
- CLI 用 `/` 前缀，Web 用 UI 控件替代 slash command
- Skill 调用本质是 Session 层操作: `session.loadSkill("name")`

**数据流**:
- 用户输入 → CommandRouter → harness 命令（直接处理）或 → Session.handleInput()
- Agent 产出 StreamEvent → Interface 渲染（文本流式，工具状态更新）
- EventBus 状态事件 → Interface 更新 TUI 面板

**Session 访问**: 初期 `SessionRegistry` 在 Infrastructure，Interface 通过 `SessionRegistry.get(sessionId)` 获取 Session 引用。先走 A（单进程内存），预留 B（跨进程）。

---

### 3.2 Session 层

**职责**: 会话容器、对话历史所有者、生命周期管理。

```
Session 层:
  ├── ConversationHistory  原始 Message[] 的唯一所有者
  ├── Lifecycle State      会话状态机
  ├── Agent Reference      持有当前 Agent 实例的引用
  ├── Plan Approval        计划审阅（delegate / user / auto）
  └── Persistence Trigger  触发 Infra.SessionStore 持久化
```

**状态机**:

```
idle → active ────────────────────────────→ ended
         │
         ├──→ awaiting_plan_output
         │         │
         │         ▼
         │     awaiting_approval          (HITL 在此)
         │         │
         │    ┌────┴────┐
         │    │ approved │ rejected → active
         │    └────┬────┘
         │         ▼
         │    approved_then_executing
         │         │
         │         ▼
         │    active → verify → ended     (可选验证)
         │
         ├──→ waiting_for_user_input      (Agent 问用户)
         ├──→ waiting_for_approval        (权限弹窗等人确认)
         └──→ paused                      (用户暂停)
```

**交互规则**:

| 场景 | 谁触发 | 谁执行 |
|------|--------|--------|
| 用户输入 | Interface | Session.handleInput() → Agent.run() |
| Agent 需要权限确认 | Agent 暂停 | Session 进 waiting_for_approval → 等人确认 → Agent.resume() |
| Agent 问用户问题 | Agent 暂停 | Session 进 waiting_for_user_input |
| SubAgent spawn | 主 Agent | 新 Agent 实例，独立上下文，无 Task 工具 |
| 消息追加 | Agent 产出 | Session.ConversationHistory.append() |
| 会话持久化 | Session 状态变更 | Session 触发 Infra.SessionStore |

**Session 层不包含**:
- ❌ ContextManager → Agent 层负责
- ❌ Agent 定义/状态 → Agent 层负责
- ❌ 工具/权限管理 → Execution 层负责
- ❌ 持久化实现 → 只触发，Infrastructure 实现

---

### 3.3 Agent 层

**职责**: Agent 实体定义 + Agent Loop 驱动 + 子 Agent 管理。

这是 Harness 的**核心层**——Agent 是什么、怎么运行、如何 spawn。

```
Agent 层:

  ┌── Agent Definition（Agent 定义）──────────────┐
  │                                               │
  │  AgentTemplate {                              │
  │    identity:  { name, systemPrompt }           │
  │    capability: ToolSet                         │
  │    intellect:  ModelConfig                     │
  │    constraints: RuleSet                         │
  │  }                                            │
  │                                               │
  │  AgentFactory: Template → Agent 实例           │
  │                                               │
  │  Agent 实例（运行时）:                          │
  │    ├── 引用 Template                           │
  │    ├── AgentState { mode, turns, tokens }      │
  │    └── run(input, sessionCtx) → result         │
  │                                               │
  └───────────────────────────────────────────────┘

  ┌── Agent Execution（Agent 驱动）────────────────┐
  │                                               │
  │  AgentLoop:                                    │
  │    ContextManager.assemble(agent, session)     │
  │      → ThinkStep (模型调用)                     │
  │      → GuardStep (LoopGuard 检查)              │
  │      → ActStep   (工具执行，Promise.all)        │
  │      → ObserveStep (结果写入 session.messages) │
  │      → TerminateStep (判断停止)                 │
  │                                               │
  │  LoopGuard:                                    │
  │    ExactRepeat / FuzzyRepeat / CycleDetection  │
  │    / OutputStagnation                          │
  │    升级阶梯: Warn → Block → Terminate           │
  │                                               │
  │  ModelRouter: 按任务选择模型                    │
  │  ModeSwitcher: default(ReAct) / plan-and-solve │
  │                                               │
  └───────────────────────────────────────────────┘

  ┌── Sub-Agent（子 Agent）────────────────────────┐
  │                                               │
  │  Agent.spawn({                                 │
  │    template: "code-reviewer",                  │
  │    prompt: "审查 login.ts",                     │
  │  }) → 新 Agent 实例                            │
  │                                               │
  │  约束 (Hub-and-Spoke):                         │
  │    • 子 Agent 无 Task 工具（防深层嵌套）         │
  │    • 独立上下文窗口（Context Rot 隔离）          │
  │    • 完成后返回摘要给主 Agent                    │
  │    • 权限 ≤ 主 Agent（bubble 继承）              │
  │                                               │
  └───────────────────────────────────────────────┘
```

**Agent.run() 执行流程**:

```
Agent.run(input, sessionCtx):
  │
  ├── ContextManager.assemble(agent, session)
  │     输入: Session.messages + Agent.tools + Agent.model + 
  │           Infra.MemoryStore + Infra.RuleLoader
  │     输出: ContextAssembly { system, tools, messages }
  │
  ├── while not done:
  │     ├── ThinkStep  → Infra.ProviderAdapter.chat()
  │     │                  → StreamEvent → Interface 渲染
  │     ├── GuardStep  → LoopGuard.check(currentTurn)
  │     ├── ActStep    → InterceptorChain → tools.execute()
  │     ├── ObserveStep → session.messages.append(result)
  │     └── TerminateStep → finish_reason? max_turns?
  │
  └── return result
```

**终止条件**:
- `finish_reason === "stop"` — 模型自主结束
- `max_turns = 50` — 第 40 轮注入软提醒
- LoopGuard 触发 Terminate — 无法打破循环

**错误处理**: 原始错误传给模型，模型决定重试/替代/报告

**Streaming**: 文本流式 → Interface；工具调用缓冲 → 完整后执行

---

### 3.4 Execution 层

**职责**: 工具管理和执行、权限控制、外部工具接入。

```
Execution 层:

  ┌─────────────────┐     ┌─────────────────┐
  │ ToolRegistry     │     │ PermissionEngine │
  │                  │     │ (Deny-first)     │
  │ read_file        │     │                  │
  │ write_file       │     │ deny rules       │
  │ shell_exec       │──→  │ ask rules        │
  │ agent_task       │     │ allow rules      │
  │ mcp:*            │     │                  │
  └─────────────────┘     └─────────────────┘
           │                       │
           └───────────┬───────────┘
                       ▼
               InterceptorChain
                  1. LoopGuard 阻断
                  2. Permission 检查
                  3. 执行
```

**模块**:
| 模块 | 职责 |
|------|------|
| ToolRegistry | 工具注册、发现、Schema 管理 |
| ToolDef | `{ name, description, inputSchema: ZodType }` — zod → TS 类型 + LLM Schema + 运行时校验 |
| PermissionEngine | deny → ask → allow，三级分类: safe(allow) / write(ask) / dangerous(deny) |
| MCPToolAdapter | 外部 MCP 工具 → 本地工具映射 |
| InterceptorChain | 同步调用链: LoopGuard → Permission → Execute |

**工具分类**:
| 级别 | 默认行为 | 示例 |
|------|---------|------|
| safe | allow | read_file, search |
| write | ask (首次后会话记忆) | write_file, edit |
| dangerous | deny (用户显式 allow) | shell_exec, delete, http_post |

---

### 3.5 Infrastructure 层

**职责**: 所有可替换、可独立测试的基础能力。

```
Infrastructure 层:

  ├── ProviderAdapter     Anthropic/OpenAI SDK 翻译层
  ├── MemoryStore         3-tier 记忆 + CompactionAgent
  ├── RuleLoader          多源规则加载 + 文件监听 + 缓存
  ├── ConfigLoader        分层配置（主文件 + 独立文件）
  ├── SessionStore        会话持久化: JSONL(messages) + JSON(state)
  ├── TraceStore          Span 级 Tracing + Token 计数
  ├── MCPClient           MCP 协议传输（stdio/HTTP）
  ├── EventBus            异步 pub/sub，任意层 emit/subscribe
  ├── SkillLoader         Skill 包加载
  ├── CommandRegistry     集中命令定义 + availableIn 过滤
  └── SessionRegistry     会话查找（内存 + 未来跨进程）
```

**MemoryStore（3-tier）**:

```
Session.ConversationHistory (唯一数据源 —— 只读引用)
    │
    ▼
MemoryStore:
  ├── Working Memory    ← Session.messages.slice(-N) 窗口引用
  ├── Compressed Memory ← CompactionAgent 生成 LLM 摘要
  │    CompactionAgent: token > 80% 触发，便宜模型，hidden: true
  │    阈值: PRUNE_PROTECT=40K, PRUNE_MINIMUM=20K
  │    失败: circuit breaker (3次后退化为规则截断)
  └── Persistent Memory ← 从 messages 提取事实 → ~/.opencamille/memory/*.md
```

**关键**: MemoryStore 不持有原始 Message[] 副本。只存储**衍生品**（压缩摘要、持久事实）。唯一数据源是 Session.ConversationHistory。

**EventBus**:
- 事件格式: `session.{id}.{event}` (如 `session.abc.turn.completed`)
- 消费者: TraceStore、TUI 面板、Hook 脚本、Plugin
- 主数据流不经过 EventBus（StreamEvent 走直接返回）

**Interceptor vs Hook**:
| | Interceptor | Hook |
|---|---|---|
| 类型 | 同步阻断 | 异步通知 |
| 参与主流程 | ✅ 能拒绝/修改 | ❌ fire-and-forget |
| 实现 | InterceptorChain (Agent+Execution) | EventBus 消费者 |

---

## 4. ContextManager（横切模块）

**职责**: 聚合多层数据，生成 LLM 可理解的 ContextAssembly。

**位置**: Agent 层调用，但不属于 Agent 层——它是横切聚合模块。

```
ContextManager.assemble(agent, session):

  L1 基础系统提示
     来源: agent.identity.systemPrompt + Infra.RuleLoader
     规则优先级: User > Project > Skill > Default
     immutable 安全规则不可覆盖
     文件监听 + 缓存（改动实时生效）

  L2 动态上下文
     来源: agent.tools (从 Execution.ToolRegistry) + 日期/目录

  L3 记忆上下文
     来源: Infra.MemoryStore (工作记忆 + 压缩摘要 + 持久事实)

     输出: ContextAssembly { system, tools, messages }
```

**特性**:
- Prompt 独立版本号，可回滚
- 多模型 Adaptive Prompt（不同模型可配不同 system prompt 策略）
- Hill-climbing 自我优化（Trace 分析 → Prompt 改进 → 版本升级）

---

## 5. 数据流

### 主数据流（同步）

```
Interface 接收用户输入
  → Session.handleInput()
    → Agent.run(input, sessionCtx)
      → ContextManager.assemble(agent, session)
      → ThinkStep → Infra.ProviderAdapter.chat()
          → StreamEvent → Interface 实时渲染文本
      → GuardStep → LoopGuard.check()
      → ActStep → InterceptorChain
          → PermissionEngine.check()
          → Tool.execute() (同 turn 内 Promise.all)
      → ObserveStep → Session.ConversationHistory.append()
      → TerminateStep → 判断是否结束
  → Session.afterRun()
```

### 事件通知流（异步）

```
各层 emit 到 EventBus:
  Interface:  "input.received"
  Session:    "session.state_changed"
  Agent:      "agent.turn.completed", "agent.loop.repeat_detected"
  Execution:  "tool.executed", "permission.denied"

消费者:
  TraceStore  ← Span 级 tracing + token 计数
  TUI panels  ← 状态栏/子 Agent 面板更新
  Hook scripts ← 外部脚本执行
  Plugin      ← 自定义逻辑
```

---

## 6. 存储布局

```
~/.opencamille/
  ├── config.json              # 主配置
  ├── permissions.json         # 权限规则（独立文件）
  ├── hooks.json               # Hook 配置（独立文件）
  ├── agents/                  # AgentTemplate 定义文件
  │   ├── default.agent.yaml
  │   └── code-reviewer.agent.yaml
  ├── memory/                  # 持久记忆 (markdown)
  │   └── *.md
  ├── sessions/                # 会话持久化
  │   └── {sessionId}/
  │       ├── state.json
  │       ├── messages.jsonl
  │       └── checkpoints/
  └── traces/                  # Eval 链路
      └── {sessionId}.jsonl
```

---

## 7. 循环工程等级

**目标: Level 4+（自验证循环）**

已设计:
- Level 3: 有状态循环（Session 持久化，跨会话恢复）
- Level 4: 自验证循环（Plan-Review-Execute + 可选 Verification）

未来:
- Level 5: 多 Agent 协作（Hub-and-Spoke 子 Agent 已设计）
- Level 6: Hill-climbing（ContextManager Prompt 版本化 + TraceStore 为此准备）

---

## 8. 参考项目

- **Claude Code**: queryLoop、deny-first 权限、hub-and-spoke 子 Agent、`.agent.md` 文件
- **OpenClaw**: Plan-Review-Execute 三阶段、Session 状态机、goal-task 循环
- **Codex/Cursor**: shell-centric 工具哲学、推理链保留、LoogGain 控制论终止
- **OpenCode**: PRUNE 双阈值、Compaction Agent、Plugin SDK
- **arXiv 2604.03515**: 5 种循环原语，11/13 Agent 组合多种原语
- **LangChain "The Art of Loop Engineering"**: 4 层 Loop 堆栈
- **LoopBuster**: 循环检测策略
