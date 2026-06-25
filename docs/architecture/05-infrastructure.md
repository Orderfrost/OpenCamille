# Layer 5: Infrastructure

> OpenCamille 架构 · 第 5 层

## 职责

所有可替换、可独立测试的基础能力。

## 模块

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

---

## Lifecycle（统一生命周期）

**设计来源**: Claude Code Hooks + OpenClaw Plugin Hooks + OpenCode Events。

```
Lifecycle 节点树:
  session.*  |  agent.*  |  turn.*  |  tool.*  |  subagent.*  |  memory.*

  before 回调: 可 block · modify · allow
  after 回调:  只观察 · fire-and-forget

  决策优先级: deny > ask > allow
```

---

## Provider Adapter

翻译 `ContextAssembly` → provider API 格式。

```
Streaming 归一化:
  Anthropic stream → StreamEvent { type, data }
  OpenAI stream    → StreamEvent { type, data }

  StreamEvent 类型: text_delta | tool_call | done | error

Message 格式:
  自定义通用格式 { role, content, tool_calls?, tool_call_id? }
  AnthropicAdapter / OpenAIAdapter 各自翻译
```

实现顺序: Anthropic 先 → 提取 interface → 加 OpenAI。

---

## MemoryStore（3-tier）

```
Session.ConversationHistory（唯一数据源，只读引用）
    │
    ▼
MemoryStore:
  ├── Working Memory    ← Session.messages.slice(-N) 窗口
  ├── Compressed Memory ← CompactionAgent 生成 LLM 摘要
  │    触发: token > 80% 上限
  │    执行: 在 turn 边界运行（不阻塞当前 turn）
  │    模型: claude-haiku（便宜模型），hidden: true
  │    失败: circuit breaker（3 次后退化为规则截断）
  │    阈值: PRUNE_PROTECT=40K, PRUNE_MINIMUM=20K
  └── Persistent Memory ← 从 messages 提取关键事实
       → ~/.camille/memory/*.md
```

---

## SkillLoader（Anthropic 标准）

严格遵循 Anthropic Skill 三层渐进式加载：

```
Skill 结构:
  skill-name/
  ├── SKILL.md            # YAML frontmatter + Markdown body
  ├── scripts/            # 可执行脚本（不加载到上下文）
  ├── references/         # 参考文档（按需加载）
  └── assets/             # 输出资源

  SKILL.md:
    ---
    name: skill-name           # 小写+连字符，最长64字符
    description: >             # 第三人称，含触发短语
    ---
    # Skill Name
    ## Workflow
    ...

L1: name + description — 会话启动加载 (~100 tokens/skill)
L2: SKILL.md body — 触发时加载 (<500 行，<5000 词)
L3: references/ — Agent 按需 read_file
```

---

## TraceStore

OpenTelemetry 标准格式：

```
Span { traceId, spanId, parentSpanId, name, duration, attributes }

嵌套:
  turn.N.think (parent)
    ├── turn.N.act.shell_exec (child)
    └── turn.N.act.write_file (child)
```

消费 Lifecycle 的 after 事件记录所有 Span。

---

## ConfigLoader

```
优先级（低→高）:
  内置默认
    → ~/.camille/config.json
      → ./camille.json (项目)
        → CLI 参数 (--model, --agent, --mode)
          → 环境变量

  独立文件: permissions.json, hooks.json 优先于主配置对应段
```

---

## SessionStore

```
~/.camille/sessions/{sessionId}/
  ├── state.json       ← 会话状态 + AgentState 快照
  ├── messages.jsonl   ← 每轮追加
  └── checkpoints/     ← 每 N 轮 checkpoint
```

恢复: state.json 重建状态 → 补读后续 messages.jsonl。

---

## 存储布局

```
~/.camille/
  ├── config.json
  ├── permissions.json
  ├── hooks.json
  ├── memory/              # 持久记忆
  ├── sessions/            # 会话持久化
  └── traces/              # Eval 链路
```

## 依赖

↓ 无（底层）
