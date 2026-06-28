# OpenCamille Top-Level Architecture

> Status: accepted draft | Updated: 2026-06-28
>
> This is the complete top-level architecture for OpenCamille. Versioned
> implementation boundaries live in `docs/scope/` and `docs/spec/`.

## Positioning

OpenCamille is an Agent Harness: it provides the runtime, context, tools,
permissions, lifecycle, recording, and extension boundaries required to run
agentic workflows.

OpenCamille v0.1 is not a Claude Code clone and not a vertical product. It is a
minimal working slice of the harness.

## Layers

```text
1. Surfaces
2. Runtime Control
3. Agent Runtime
4. Services
5. Infrastructure
```

Dependency direction:

```text
Surfaces
  -> Runtime Control
  -> Agent Runtime
  -> Services
  -> Infrastructure
```

Runtime event flow:

```text
Lifecycle/EventBus
  -> Surfaces
  -> Recorder
  -> Hooks/Plugins
```

## 1. Surfaces

Surfaces are user or external entry points.

Top-level:

```text
Surfaces
  CLI
  Web later
  API later
```

v0.1 implements CLI only.

Surfaces handle input, streaming display, approval prompts, and command entry.
They do not call providers, execute tools, mutate session history, or write run
records directly.

## 2. Runtime Control

Runtime Control owns live session state and coordinates execution.

Responsibilities:

```text
Runtime Control
  - owns live Session
  - owns ConversationHistory
  - owns run status
  - owns pending approval state
  - owns budget counters
  - routes Commands
  - calls AgentLoop for a turn
  - handles approval pause/resume
  - rehydrates live Session from Recorder checkpoint
```

Rules:

- Runtime Control is the only writer of live `ConversationHistory`.
- Agent Runtime returns turn results; it does not mutate the live Session.
- Recorder records and checkpoints; it does not own live state.
- ContextManager reads session state; it does not mutate it.

v0.1 implementation should keep state in one `Session` object:

```text
Session
  status
  conversationHistory
  pendingApproval
  budget
```

Do not split `RunState`, `ApprovalState`, and `BudgetState` into separate
implementation classes in v0.1.

## 3. Agent Runtime

Agent Runtime runs the model/tool loop.

```text
Agent Runtime
  AgentLoop
  ContextManager
```

`AgentLoop`:

```text
- calls ContextManager.build()
- calls ProviderAdapter.stream()
- emits lifecycle timeline events
- accumulates model deltas into final assistant messages
- calls Tools.runToolCall() for tool uses
- handles approval_required by returning control to Runtime Control
- handles context_overflow by compacting once and retrying once
- checks max turns, budget, and abort signal inline
```

`ContextManager`:

```text
- reads ConversationHistory from Runtime Control
- reads Memory summaries/persistent memory
- reads active Skills
- reads Tools schemas
- reads MCP metadata exposed by Services
- builds provider-neutral ContextAssembly
```

Do not add these as v0.1 modules:

```text
ToolExecutor
ExecutionStrategy
TerminationGuard
AgentRuntimeEvent
ToolCallCoordinator
ContextPipeline
StateMachineEngine
```

## 4. Services

Services contain harness capabilities above raw infrastructure.

```text
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
```

### Tools

`Tools` owns the tool system.

```text
Tools
  - register tools
  - list tool schemas
  - resolve tool names
  - runToolCall()
```

`runToolCall()` may validate arguments, ask `PermissionEngine`, execute the
callable, normalize/redact results, and return one of:

```text
ok
error
approval_required
```

`Tools` must not mutate `ConversationHistory`, wait for user approval, call the
LLM, or write Recorder files directly.

### Skills

Skills follow the Anthropic Agent Skills specification.

```text
skill-name/
  SKILL.md
  scripts/ later
  references/ later
  assets/ later
```

OpenCamille maintains a `SkillIndex` from `SKILL.md` metadata and registers a
built-in `Skill` tool through `Tools`. The `Skill` tool activates a skill and
loads its body into context.

v0.1 supports progressive loading at metadata/body level and defers dynamic
command injection, forked subagents, skill-scoped hooks, live file watching, and
nested monorepo discovery.

### Memory

Memory manages context material derived from or outside current conversation
history.

v0.1:

```text
Memory
  SessionSummary
  PersistentMemory
```

No `WorkingNotes`, RAG, vector database, retrieved memory, automatic fact
extraction, or cross-project autonomous learning in v0.1.

### MCP

MCP follows the official Model Context Protocol.

```text
Agent Services / MCP
  - adapts MCP tools into Tools
  - exposes resources/prompts later

Infrastructure / MCPClient
  - stdio JSON-RPC
  - listTools
  - callTool
```

v0.1 supports stdio MCP tools only.

### Lifecycle

Lifecycle defines the stable run timeline and hook point names. It owns the
in-process EventBus.

Run timeline:

```text
session_created
session_resumed
session_closed

run_started
turn_started
context_built
context_overflow
model_started
model_delta
model_finished
model_failed
tool_requested
approval_requested
approval_resolved
tool_started
tool_finished
tool_failed
tool_denied
compaction_started
compaction_finished
compaction_failed
checkpoint_started
checkpoint_finished
checkpoint_failed
turn_finished
turn_failed
run_finished
run_failed
run_cancelled
```

Only AgentLoop and Runtime Control emit lifecycle events.

### Hooks

Hooks run callbacks at fixed hook points. They are not just EventBus
subscribers, because some hook points can block or modify flow.

Hook points:

```text
session_start
session_resume
session_stop
before_user_message
after_user_message
before_context_build
after_context_build
before_model_call
after_model_call
before_tool_call
after_tool_call
before_permission_request
after_permission_resolved
before_compaction
after_compaction
before_checkpoint
after_checkpoint
before_message_display
```

v0.1 places all hook points but keeps most observe-only. `before_tool_call` may
deny/modify args, `after_tool_call` may modify result, `before_user_message` may
deny/modify text, and `before_message_display` may modify display only.

### Plugins

Plugins are a top-level extension concept, but v0.1 does not implement a full
plugin package format.

v0.1 may allow local config to register hooks, tools, or skills. No marketplace,
remote install, dependency solver, or plugin sandbox.

### Recorder

Recorder persists run evidence and recovery material.

```text
.opencamille/runs/<runId>/
  events.jsonl
  transcript.jsonl
  checkpoint.json
```

Semantics:

```text
events.jsonl      = timeline truth for eval, replay, and debug
transcript.jsonl  = readable conversation index for UI/export/demo
checkpoint.json   = resume source
```

Resume reads checkpoint. Replay reads events. Eval reads events first and may
also use transcript and workspace artifacts.

Recorder subscribes to EventBus. It does not execute hooks, mutate live Session,
or restore state by event sourcing.

## 5. Infrastructure

Infrastructure contains low-level adapters and safety boundaries.

```text
Infrastructure
  ProviderAdapter
  Config
  PermissionEngine
  MCPClient
  CommandRunner
  WorkspacePath
```

`ProviderAdapter`:

```text
- accepts ContextAssembly
- calls provider SDK/API
- returns provider-neutral stream items:
  model_delta
  tool_use
  final_message
  usage
  error
```

`Config`:

```text
- loads env and config files
- defines provider/model/MCP/permission defaults
- enforces precedence
- never writes secrets into Recorder
```

Recommended precedence, low to high:

```text
built-in defaults
  -> env
  -> user config
  -> project config
  -> CLI flags
```

`PermissionEngine` returns only:

```text
allow | ask | deny
```

It does not wait for users and does not own approval state.

`CommandRunner` is a small `runCommand()` capability for timeout, abort signal,
stdout/stderr limits, and exit code normalization.

`WorkspacePath` is a small `resolveWorkspacePath()` capability for path boundary
checks.

Do not add these as v0.1 modules:

```text
FileSystem
Shell class
Storage abstraction
Sandbox abstraction
ProviderFactory
PolicyStore
SecretsManager
NetworkClient
```

Use Node standard library directly unless a safety boundary requires one small
function.

## Critical Contracts

These contracts are required for v0.1:

```text
Approval resume:
  Tools.runToolCall() returns approval_required.
  Runtime Control pauses and later resumes the same tool call.

Provider streaming:
  ProviderAdapter hides vendor-specific stream formats.

Tool result normalization/redaction:
  Tool output is normalized and redacted before entering model context,
  Transcript, or Events.

Context overflow:
  ContextManager reports overflow.
  AgentLoop calls Memory.compact() once and retries once.

Config and secrets:
  Config precedence is deterministic.
  Secrets are never recorded.
```
