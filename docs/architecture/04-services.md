# Layer 4: Services

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

`Tools` owns tool registration, schema listing, resolution, and `runToolCall()`.
It does not mutate conversation history, wait for approval, call providers, or
write Recorder files.

`Skills` follows Anthropic Agent Skills. OpenCamille maintains a `SkillIndex`
and exposes a built-in `Skill` tool.

`Memory` is `SessionSummary` and `PersistentMemory` in v0.1. No WorkingNotes,
RAG, or vector memory.

`MCP` adapts stdio MCP tools into `Tools` in v0.1.

`Lifecycle` owns run timeline event names and EventBus.

`Hooks` run fixed hook points; EventBus is for observation/streaming, not
blocking hooks.

`Plugins` stays minimal in v0.1: no plugin package format.

`Recorder` writes `events.jsonl`, `transcript.jsonl`, and `checkpoint.json`.
