# 横切模块（Cross-Cutting）

> OpenCamille 架构 · 横切关注面

## Lifecycle（统一生命周期系统）

**位置**: Infrastructure 层实现，所有层注册回调。

**设计来源**: Claude Code Hooks 5 步管线 + OpenClaw Plugin Hooks + OpenCode 32+ Events。

---

### 核心概念

单个机制统一了之前的 InterceptorChain、Hook、EventBus：

```
Lifecycle = 生命周期节点树 + before/after 回调

  before 节点:  可 block · modify · allow
  after 节点:   只观察 · fire-and-forget（不能阻止）
```

**不是 Interceptor vs Hook**——是同一个回调注册在 before 还是 after 节点。

---

### 生命周期节点

```
Session 级:
  session.create → session.start → session.pause → session.resume → session.end

Agent 级:
  agent.spawn → agent.run.start → agent.run.end → agent.destroy

Turn 级:
  turn.start
    → context.assembled
    → think.start → think.completed
    → guard.check
    → act.start → tool.* → act.completed
    → observe
    → terminate.check
  turn.end

Tool 级:
  tool.pre → tool.execute → tool.post

SubAgent 级:
  subagent.spawn → subagent.end

Memory 级:
  memory.compaction
```

---

### 回调注册

```typescript
// before 回调 — 可阻断
lifecycle.on("tool.pre", handler: (ctx) => {
  return {
    decision: "allow" | "deny" | "ask",
    updatedInput?: { ... },         // 修改参数
    reason?: string                 // 拒绝原因，传给模型
  }
})

// after 回调 — 只观察
lifecycle.on("tool.post", handler: (ctx) => {
  // fire-and-forget，无返回值
})
```

---

### 决策优先级

多个 handler 注册在同一节点时：

```
deny > ask > allow

一个 deny 拒绝所有（Claude Code 模式）
```

---

### 内置 handler

| Handler | 节点 | 类型 |
|---------|------|------|
| PermissionEngine | tool.pre | before — deny/ask/allow |
| LoopGuard | tool.pre | before — 检测重复 → deny |
| TraceStore | tool.post, turn.end, session.* | after — 记录 Span |
| TUI 刷新 | turn.end | after — 界面更新 |

---

### 匹配器

```typescript
lifecycle.on("tool.pre", handler, {
  match: "write_file"           // 只匹配此工具
  match: "write_file|shell_exec" // 匹配多个
  match: "*"                     // 匹配所有（默认）
})
```

---

## ContextManager

**位置**: Agent 层每轮 Think 前调用，横切聚合多层数据。

**职责**: 组装 Prompt，适配不同厂商 API 的注入方式差异。

```
输入:
  ├── Agent 身份定义 (system prompt)
  ├── 规则文件（User/Project，从文件系统读取）
  ├── Skill 片段（L1 元数据 → 动态上下文，L2 body → 身份层）
  ├── 工具快照（从 Service.ToolRegistry）
  └── 记忆（从 MemoryStore）

输出: ContextAssembly {
  system:     string    ← 身份层（Agent identity + L2 Skill + 安全规则）
  reminders:  string[]  ← 规则层（User/Project rules，权重低于 system）
  tools:      ToolDef[] ← 工具列表
  messages:   Message[] ← 对话历史
}

ProviderAdapter 翻译:
  Anthropic: system → system[], reminders → messages 的 <system-reminder>
  OpenAI:    system + reminders → role:"system" message
```

**Skill 渐进式加载（Anthropic 标准）**:

| 层 | 何时加载 | 注入位置 |
|----|---------|---------|
| L1 元数据 | 会话启动始终加载 | ContextAssembly 的 reminders（技能列表） |
| L2 指令正文 | Skill 触发时 | ContextAssembly 的 system |
| L3 资源文件 | Agent 按需读取 | 不预加载 |

**Prompt 版本**: git 文件版本化。Prompt 文件在仓库里，git tag = 版本点。

---

## SkillLoader

**位置**: Infrastructure 层，横跨 Service + Agent。

**职责**: 加载/卸载 Skill 能力包。严格遵循 Anthropic Skill 标准。

```
Skill 结构:
  skill-name/
  ├── SKILL.md            # 必需: YAML frontmatter + Markdown body
  ├── scripts/            # 可选: 可执行脚本
  ├── references/         # 可选: 参考文档（按需加载）
  └── assets/             # 可选: 输出资源

SKILL.md frontmatter:
  ---
  name: skill-name           # 小写+连字符，最长64字符
  description: >             # 第三人称，含触发短语
  ---

三层渐进式加载:
  L1: name + description — 始终在上下文 (~100 tokens)
  L2: SKILL.md body — 触发时加载 (<500 行)
  L3: references/ — Agent 按需 read_file
```
