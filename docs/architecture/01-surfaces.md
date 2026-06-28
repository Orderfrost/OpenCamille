# Layer 1: Surfaces

Surfaces are user or external entry points.

v0.1 implements CLI only.

```text
Surfaces
  CLI
  Web later
  API later
```

CLI responsibilities:

```text
- parse input and flags
- send user text/commands to Runtime Control
- render lifecycle streaming events
- show approval prompts
- display final messages
```

CLI must not call providers, execute tools, mutate `ConversationHistory`, or
write Recorder files directly.
