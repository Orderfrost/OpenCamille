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
| 职责 | 提供基础设施 | 执行具体任务 |
| 内容 | Loop、工具、权限、记忆、模型调用 | System Prompt、行为规则、工具选择 |
| 类比 | 操作系统 | 运行在 OS 上的程序 |

---

## 2. 整体分层（5 层 + 横切模块）

### 依赖规则

- **正向依赖**（默认允许）: Interface → Session → Agent Loop → Execution → Infrastructure
- **跨层依赖**（显式声明即允许）: Agent Loop 可直达 Infrastructure 的 ProviderAdapter、MemoryStore；Session 可直达 Infrastructure 的 SessionStore
- **横切模块**（无层限制）: ContextManager、InterceptorChain、EventBus、SkillLoader

### 架构总览

```
┌──────────────────────────────────────────────────────────┐
│ Interface    输入/输出、命令路由、多界面订阅同一会话          │
├──────────────────────────────────────────────────────────┤
│ Session      会话生命周期、Agent 实例管理、对话历史           │
│              Plan-Review-Execute 状态机（可选路径）          │
├──────────────────────────────────────────────────────────┤
│ Agent Loop   ContextManager、ReAct 循环、LoopGuard        │
│              Model Router、执行模式切换                     │
├──────────────────────────────────────────────────────────┤
│ Execution    工具注册、权限引擎(Deny-first)、MCP 适配        │
├──────────────────────────────────────────────────────────┤
│ Infrastructure  Provider Adapter、MemoryStore(含Compaction)│
│                 RuleLoader、EventBus、SessionStore        │
│                 TraceStore、SkillLoader、CommandRegistry   │
└──────────────────────────────────────────────────────────┘

横切模块（Cross-cutting）:
  ContextManager      ← 聚合上下文，Agent Loop 每轮调用
  InterceptorChain    ← 同步阻断，跨越 AgentLoop + Execution
  EventBus            ← 异步通知，任意层可 emit/subscribe
  SkillLoader         ← 能力包加载，调用 Execution + Infra
```

---

## 3. 各层设计

### 3.1 Interface 层

**职责**: 用户输入捕获、输出渲染、命令路由

```
Interface 层:
  ├── Input Capture:    CLI(stdin) / Web(HTTP/WS)
  ├── Output Render:    TUI(ink) / Web(SSE)
  ├── Command Router:   解析 / 前缀 → 路由到 harness 命令 / skill / 用户消息
  └── Multi-Interface:  多个 Interface 订阅同一 Session 的流
```

**命令系统**:
- CommandRegistry 在 Infrastructure 层定义所有命令，每个命令标记 `availableIn`
- CLI 用 `/` 前缀触发命令，Web 用 UI 控件替代（不暴露 slash command）
- Skill 调用（`/skill-name`）本质是 Session.loadSkill() 操作

**数据流**:
- 用户输入 → 命令路由 → harness 命令（Interface 直接处理）或 → Session → Agent Loop
- Agent Loop 的 StreamEvent → Interface 渲染（文本流式，工具状态更新）
- EventBus 的状态事件 → Interface 更新 TUI 面板

### 3.2 Session 层

**职责**: 会话容器、生命周期管理、对话历史 owner

```
Session 状态机:

  idle → active ────────────────────────────→ ended
           │
           ├──→ awaiting_plan_output        (Agent 选 plan-and-solve)
           │         │
           │         ▼
           │     awaiting_approval          (人审/编排器审/自动)
           │         │
           │    ┌────┴────┐
           │    │ approved │ rejected → active
           │    └────┬────┘
           │         ▼
           │    approved_then_executing     (逐步执行子目标)
           │         │
           │         ▼
           │    active → verify → ended     (可选验证)
           │
           ├──→ waiting_for_user_input      (Agent 问用户问题)
           ├──→ waiting_for_approval        (权限弹窗等人确认)
           └──→ paused                      (用户暂停)
```

**模块**:
| 模块 | 职责 |
|------|------|
| SessionManager | 创建/恢复/暂停/结束会话 |
| AgentInstanceManager | 创建 Agent 实例，绑定 tools/prompt/model |
| ConversationHistory | 原始 Message[] 的 owner（内存） |
| PlanApproval | 计划审阅模式: delegate / user / auto |
| SessionPersistence | 触发保存到 Infra.SessionStore |

**Plan-Review-Execute**:
- 是可选路径，不是所有任务都走
- `planApproval` 配置: `delegate`（编排器审）/ `user`（HITL）/ `auto`（跳过）
- HITL 不作为同步 Interceptor——在此作为 Session 异步状态

### 3.3 Agent Loop 层

**职责**: 每轮决策循环、上下文组装、循环防护

```
Agent Loop — 单轮 Pipeline:

  ContextManager.assemble()
       │
       ▼
  ThinkStep ────→ Infra.ProviderAdapter.chat()
       │              │
       │         StreamEvent → Interface 渲染
       │
       ▼
  GuardStep ──── LoopGuard 检查
       │              ├── ExactRepeat / FuzzyRepeat / Cycle / Stagnation
       │              └── Warn → Block → Terminate
       ▼
  ActStep ──────→ 并行执行 tool_calls (Promise.all)
       │              │
       │         InterceptorChain:
       │           1. LoopGuard 阻断检查
       │           2. PermissionEngine 权限检查
       │           3. 执行工具
       │
       ▼
  ObserveStep ── 结果写入 messages
       │
       ▼
  TerminateStep ─ finish_reason? max_turns?
```

**模块**:
| 模块 | 职责 |
|------|------|
| **ContextManager**（横切聚合） | 聚合 Session/Execution/Infra 数据 → ContextAssembly |
| ReActLoop | Think → Guard → Act → Observe → Terminate 主循环 |
| LoopGuard | 循环检测 + 升级阶梯 (Warn/Block/Terminate) |
| ModelRouter | 按任务复杂度选择模型 |
| ModeSwitcher | 切换执行模式: default(ReAct) / plan-and-solve |

**ContextManager**（横切模块，Agent Loop 每轮调用）:

```
ContextManager.assemble():

  L1 基础系统提示 ── 来自 Infra.RuleLoader（加载多源规则，按优先级合并）
  L2 动态上下文   ── 来自 Execution.ToolRegistry + Execution.PermissionEngine + 日期/目录
  L3 记忆上下文   ── 来自 Infra.MemoryStore（持久 + 压缩 + 工作窗口）

  输出: ContextAssembly { system, tools, messages }
  
  特性:
  ├── Prompt 版本管理: 独立版本号，可回滚
  ├── 多源规则优先级: User > Project > Skill > Default（immutable 安全规则不可覆盖）
  ├── 文件监听 + 缓存: 规则文件变更实时生效
  └── 规则冲突检测: Aiscope 模式 6 段管道（未来）
```

**终止条件**:
- `finish_reason === "stop"` — 模型自主结束
- `max_turns = 50` — 第 40 轮软提醒 "还剩 10 轮，尽快收尾"
- LoopGuard 触发 Terminate — 循环无法打破

**工具执行**: 同 turn 内 Promise.all，跨 turn 串行

**错误处理**: 原始错误传给模型，模型决定重试/替代/报告

### 3.4 Execution 层

**职责**: 工具管理与执行、权限控制、外部工具接入

```
Execution 层:

  ┌─────────────────┐     ┌─────────────────┐
  │ ToolRegistry     │     │ PermissionEngine │
  │                  │     │ (Deny-first)     │
  │ read_file        │     │                  │
  │ write_file       │     │ deny rules       │
  │ shell_exec       │     │ ask rules        │
  │ agent_task ──────┼──→  │ allow rules      │
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
| PermissionEngine | Deny-first: deny → ask → allow；3 级分类: safe/write/dangerous |
| MCPToolAdapter | 外部 MCP 工具 → 本地工具映射 |
| InterceptorChain | 同步调用链: LoopGuard → Permission → Execute |

**初始工具**: `read_file`, `write_file`, `shell_exec`, `agent_task`

**子 Agent 编排（Hub-and-Spoke）**:
- `agent_task` 工具 spawn 子 Agent
- 子 Agent 无 Task 工具（防深层嵌套）
- 独立上下文窗口（Context Rot 隔离）
- 完成后只返回摘要
- 权限继承: 子 Agent 权限 ≤ 主 Agent（bubble 模式）

### 3.5 Infrastructure 层

**职责**: 所有可替换、可独立测试的基础能力

```
Infrastructure 层:

  ├── ProviderAdapter     Anthropic/OpenAI SDK 翻译层
  ├── MemoryStore         3-tier 记忆 + CompactionAgent
  ├── RuleLoader          多源规则加载（User/Project/Skill/Default）
  │                       优先级合并 + 文件监听 + 缓存
  ├── EventBus            异步 pub/sub，任意层 emit/subscribe
  ├── SessionStore        会话持久化: JSONL(messages) + JSON(state)
  ├── TraceStore          Span 级 Tracing + Token 计数
  ├── SkillLoader         Skill 包加载（工具 + Prompt + 规则）
  ├── CommandRegistry     集中命令定义 + availableIn 过滤
  ├── ConfigLoader        分层配置（主文件 + 独立文件 + env）
  └── MCPClient           MCP 协议传输（stdio/HTTP）
```

**MemoryStore（3-tier）**:
| 层 | 内容 | 存储 |
|----|------|------|
| 工作记忆 | 当前对话窗口的原始 Message[] | 内存（Session 的 ConversationHistory） |
| 压缩记忆 | 早期对话的 LLM 摘要 | 内存 |
| 持久记忆 | 跨会话事实/偏好/规则 | `~/.opencamille/memory/*.md` |

**CompactionAgent**:
- 触发: token 超过 80% 上限
- 执行: 独立 Agent 实例（hidden: true），便宜模型（如 claude-haiku）
- 输出: 早期消息的结构化摘要
- 失败: 退化为规则截断（circuit breaker，3 次失败后降级）
- 阈值: PRUNE_PROTECT=40K（保护窗口），PRUNE_MINIMUM=20K（最小释放量）

**EventBus**:
- 事件格式: `session.{id}.{event}`（如 `session.abc.turn.completed`）
- 消费者: Hook、TraceStore、TUI 面板更新、Plugin
- 主数据流不经过 EventBus（StreamEvent 走直接返回）

**Interceptor vs Hook**:
| | Interceptor | Hook |
|---|---|---|
| 类型 | 同步阻断 | 异步通知 |
| 用途 | Permission、LoopGuard | 日志、Eval、UI更新 |
| 参与主流程 | ✅ 能拒绝/修改 | ❌ fire-and-forget |
| 实现 | InterceptorChain | EventBus 消费者 |

---

## 4. 数据流

### 主数据流（同步）

```
Interface 接收用户输入
  → Session.handleInput()
    → Agent Loop.run(contextAssembly)
      → ThinkStep → ProviderAdapter.chat() → StreamEvent → Interface 渲染
      → GuardStep → LoopGuard.check()
      → ActStep → InterceptorChain → Tool.execute()
      → ObserveStep → ConversationHistory.append()
      → TerminateStep → 判断结束
  → Session.afterLoop()
```

### 事件通知流（异步）

```
各层 emit 到 EventBus:
  Interface:  "input.received"
  Session:    "session.state_changed"
  Agent Loop: "turn.completed", "loop.repeat_detected"
  Execution:  "tool.executed", "permission.denied"

消费者:
  TraceStore: 记录所有 span 事件
  TUI 面板:   更新状态栏/子Agent面板
  Hook:       执行外部脚本
  Plugin:     自定义逻辑
```

---

## 5. 流策略

- **文本**: 流式（StreamEvent → Interface 实时渲染）
- **工具调用**: 缓冲到完整调用后执行（避免 partial JSON）
- **状态事件**: 异步通过 EventBus

---

## 6. 环路工程等级

目标: Level 4（自验证循环）+

已设计的能力:
- Level 3: 有状态循环（Session 持久化，跨会话恢复）
- Level 4: 自验证循环（Plan-Review-Execute + 可选 Verification）

未来:
- Level 5: 多 Agent 循环（Hub-and-Spoke 子 Agent 已设计，Multi-Agent 协作待扩展）
- Level 6: Hill-climbing 自我改进（ContextManager Prompt 版本化为此准备）

---

## 7. 参考

- Claude Code: VILA-Lab 逆向分析, 官方文档 (queryLoop, deny-first, hub-and-spoke)
- OpenClaw: 源码分析 (Plan-Review-Execute, Session 状态机, goal-task 循环)
- Codex/Cursor: 工程博客 (shell-centric, 推理链保留, 工具设计)
- OpenCode: DeepWiki 分析 (PRUNE 双阈值, Compaction Agent, Plugin SDK)
- arXiv 2604.03515: 5 种循环原语分类, 11/13 Agent 组合多种原语
- LangChain "The Art of Loop Engineering": 4 层 Loop 堆栈
- LoopBuster: 循环检测策略
