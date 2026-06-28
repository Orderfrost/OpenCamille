# Lifecycle, Hooks, And Recorder

Lifecycle is the single source of run timeline event names and hook point names.

## EventBus

EventBus is an in-process pub/sub owned by Lifecycle.

Only AgentLoop and Runtime Control emit lifecycle events.

EventBus consumers:

```text
Surfaces  -> streaming display
Recorder  -> durable events
Hooks     -> observation where applicable
Plugins   -> optional extension behavior
```

## Hooks

Hooks run at fixed hook points. They are not only EventBus subscribers because
some hook points can block or modify flow.

v0.1 places all hook points, but only a few can modify/block:

```text
before_tool_call      deny/modify args
after_tool_call       modify result
before_user_message   deny/modify text
before_message_display modify display only
```

All other hook points are observe-only in v0.1.

## Recorder

Recorder writes:

```text
.opencamille/runs/<runId>/
  events.jsonl
  transcript.jsonl
  checkpoint.json
```

```text
events.jsonl      timeline truth for eval/replay/debug
transcript.jsonl  readable conversation index
checkpoint.json   resume source
```

Resume reads checkpoint, not event replay. Replay reads events. Eval primarily
reads events.
