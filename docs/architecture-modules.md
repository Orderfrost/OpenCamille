# OpenCamille Architecture Modules

> Updated: 2026-06-28
>
> This file is the compact module index. See `docs/architecture.md` for the
> accepted top-level architecture.

## Module Map

```text
Surfaces
  CLI
  Web later
  API later

Runtime Control
  Session
  ConversationHistory
  CommandDispatcher
  approval pause/resume
  budget/status fields

Agent Runtime
  AgentLoop
  ContextManager

Services
  Agent Services
    Tools
    Skills
    Memory
    MCP
    Subagents later

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

## Data Flow

```text
CLI
  -> Runtime Control / CommandDispatcher
  -> ConversationHistory append
  -> AgentLoop.runTurn(session)
  -> ContextManager.build(session)
  -> ProviderAdapter.stream(context)
  -> Tools.runToolCall(toolUse)
  -> Runtime Control appends final messages
```

## Event Flow

```text
AgentLoop / Runtime Control
  -> Lifecycle.emit(event)
  -> EventBus
  -> CLI streaming display
  -> Recorder events
  -> Hooks/Plugins where applicable
```

Only AgentLoop and Runtime Control emit lifecycle events. Other modules return
results.

## Recorder Files

```text
.opencamille/runs/<runId>/
  events.jsonl
  transcript.jsonl
  checkpoint.json
```

```text
events.jsonl      -> eval/replay/debug
transcript.jsonl  -> readable UI/export/demo
checkpoint.json   -> resume
```

## v0.1 Implementation Bias

- Fewer files are better than empty layers.
- Keep `Tools.runToolCall()` in Tools; do not split `ToolExecutor`.
- Keep `runCommand()` and `resolveWorkspacePath()` as small infrastructure
  safety functions.
- Keep plugin support minimal; no plugin package format in v0.1.
- Keep state in one `Session` object; do not split state classes.
