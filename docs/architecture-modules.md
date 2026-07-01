# OpenCamille 模块索引

> 更新日期：2026-06-29  
> 作用：给开发者和 AI Agent 快速定位模块。完整说明见 `docs/architecture.md`，模块细节见 `docs/architecture/`。

## 总览

```text
Surfaces
  CLI
  Web 延后
  API 延后

Runtime Control
  Session
  ConversationHistory
  CommandDispatcher
  approval pause/resume
  status / pendingApproval / budget

Agent Runtime
  AgentLoop
  ContextManager

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

Infrastructure
  ProviderAdapter
  Config
  PermissionEngine
  MCPClient
  CommandRunner
  WorkspacePath
```

## 模块读取顺序

开发某个功能前，按这个顺序读：

```text
docs/README.md
docs/ai-development-guide.md
docs/architecture.md
docs/scope/v0.1.md
docs/spec/v0.1-architecture.md
对应的 docs/architecture/*.md
```

实现 ContextManager 前额外阅读：

```text
docs/implementation/v0.1/context-manager-design.md
```

## 主执行链路

```text
CLI
  -> Runtime Control / CommandDispatcher
  -> Runtime Control 写入 user message
  -> AgentLoop.runTurn(session)
  -> ContextManager.build({ session, config, extraSources })
  -> ContextManager 读取/复用 ContextSnapshot，计算 ContextBudget
  -> ProviderAdapter.stream(context)
  -> AgentLoop 收集 model_delta / tool_use / final_message
  -> Tools.runToolCall(toolUse)
  -> Runtime Control 写入 assistant/tool final message
```

## ContextManager 快速契约

```text
输入按 ContextSource 组织：
  builtin / config / file / session / tools / mcp / skills / memory

自行读取的本地文件只限：
  AGENTS.md / Agent.md

维护：
  ContextSnapshot
  ContextBudget
  source fingerprints

返回：
  ok -> ContextAssembly
  context_overflow -> 不截断 messages，交给 AgentLoop 触发 Memory.compact()
```

ContextManager 不做：

```text
不扫描 MCP server
不扫描 Skill 目录
不检索 Memory
不压缩 Memory
不写 Session
不写 Recorder
不做权限判断
```

## 事件链路

```text
AgentLoop / Runtime Control
  -> Lifecycle.emit(event)
  -> EventBus
  -> CLI 渲染 streaming
  -> Recorder 写 events.jsonl
  -> Hooks/Plugins 扩展观察或固定 HookPoint 执行
```

只有 AgentLoop 和 Runtime Control 可以直接 emit lifecycle events。

## 持久化链路

```text
Recorder
  events.jsonl
    -> eval / replay / debug

  transcript.jsonl
    -> UI / export / demo

  checkpoint.json
    -> resume
```

不要用 events replay 恢复 live Session。Resume 只读 checkpoint。checkpoint 可以包含脱敏后的 ContextSnapshot，恢复后由 ContextManager 根据 source fingerprint 判断复用或重建。

## v0.1 文件粒度建议

实现时可以少建文件，但不要混淆职责。

```text
src/surfaces/cli.ts

src/runtime-control/session.ts
src/runtime-control/commands.ts

src/agent-runtime/loop.ts
src/agent-runtime/context.ts

src/services/tools.ts
src/services/skills.ts
src/services/memory.ts
src/services/mcp.ts
src/services/lifecycle.ts
src/services/hooks.ts
src/services/recorder.ts

src/infrastructure/provider.ts
src/config.ts
src/infrastructure/permissions.ts
src/infrastructure/mcp.ts
src/infrastructure/command.ts
src/infrastructure/workspace.ts
```

这是建议，不是强制。如果实现非常小，可以合并文件；但不能新增未确认的大模块。

## 禁止提前抽象

v0.1 不要实现：

```text
ToolExecutor
ExecutionStrategy
TerminationGuard
AgentRuntimeEvent
ContextLoader
SourceRegistry
BudgetService
StorageRepository
FileSystem class
Shell class
PolicyStore
ProviderFactory
Plugin package format
Subagent orchestrator
Vector memory
RAG
```

## 每个模块实现前要回答的问题

开发者或 AI Agent 在写代码前必须能回答：

```text
这个模块为什么存在？
它的唯一职责是什么？
它依赖谁？
谁依赖它？
它是否会写 live Session？
它是否会写 Recorder？
它是否可能触发 permission ask？
它是否会接触 secrets？
它是否属于 v0.1 scope？
```
