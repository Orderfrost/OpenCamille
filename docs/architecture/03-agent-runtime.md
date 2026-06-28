# Layer 3: Agent Runtime

Agent Runtime is the model/tool execution loop.

```text
Agent Runtime
  AgentLoop
  ContextManager
```

`AgentLoop`:

```text
- builds context
- calls ProviderAdapter.stream()
- emits turn/model/tool lifecycle events
- accumulates model deltas into final assistant messages
- calls Tools.runToolCall()
- returns approval_required to Runtime Control
- compacts once and retries once on context overflow
```

`ContextManager` builds provider-neutral:

```text
ContextAssembly
  system
  tools
  messages
```

Do not add v0.1 modules for `ToolExecutor`, `ExecutionStrategy`,
`TerminationGuard`, or `AgentRuntimeEvent`.
