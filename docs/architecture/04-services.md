# Layer 4: Services

## 模块定位

Services 是 Harness 能力层。它高于底层 Infrastructure，但不拥有 live Session。

```text
Services
  Agent Services
    Tools
    Skills
    Memory
    MCP
    Subagents 延后

  Runtime Services
    Lifecycle
    Hooks
    Plugins
    Recorder
```

## Agent Services

### Tools

为什么存在：

```text
统一内置 tools、Skill tool、MCP tools 的注册、schema 暴露、解析和执行入口。
```

职责：

```text
register
list schemas
resolve
runToolCall
zod validation
permission gate
result normalization/redaction
```

边界：

```text
不改 ConversationHistory
不等待 approval
不写 Recorder
不调 LLM
不拥有 MCP transport
```

### Skills

为什么存在：

```text
用标准 Skill 协议为 Agent 提供任务知识包，避免把所有任务说明都写进 base prompt。
```

职责：

```text
扫描 user/project skill directories
读取 SKILL.md
维护 SkillIndex
通过 built-in Skill tool 激活 skill body
向 ContextManager 提供 active skill 内容
```

必须遵循 Anthropic Agent Skills，不自定义格式。

### Memory

为什么存在：

```text
LLM 没有真正记忆，且上下文窗口有限；Memory 负责保存可重新注入上下文的摘要或显式长期记忆。
```

v0.1：

```text
SessionSummary
PersistentMemory
```

不做：

```text
WorkingNotes
RAG
vector memory
automatic fact extraction
```

### MCP

为什么存在：

```text
遵循官方 MCP 协议接入外部工具生态，同时让 MCP tools 走 OpenCamille 统一 Tools/Permission/Recorder 路径。
```

职责：

```text
把 MCP tools 适配成 ToolDefinition
注册到 Tools
后续再支持 resources/prompts
```

v0.1 只做 stdio tools。

## Runtime Services

### Lifecycle

为什么存在：

```text
为 streaming UI、Recorder、Hooks、Replay、外部 Eval 提供统一运行时间线。
```

职责：

```text
定义 RunEvent names
定义 HookPoint names
拥有 in-process EventBus
```

### Hooks

为什么存在：

```text
在固定生命周期点允许用户或插件观察、修改或阻断少数流程。
```

v0.1：

```text
全部 HookPoint 埋点
默认只观察
before_tool_call 可 deny/modify
after_tool_call 可 modify_result
before_user_message 可 deny/modify
before_message_display 可 modify display
```

### Plugins

为什么存在：

```text
长期用于打包 hooks/tools/skills/commands 等扩展。
```

v0.1 不做完整插件包格式，只允许本地 config 注册扩展。

### Recorder

为什么存在：

```text
提供运行证据、可读 transcript、checkpoint resume 材料，以及外部 Eval 可消费的 trace。
```

文件：

```text
events.jsonl
transcript.jsonl
checkpoint.json
```

边界：

```text
不修改 live Session
不执行 Hooks
不通过 event sourcing 恢复状态
不内置 Eval runner
```
