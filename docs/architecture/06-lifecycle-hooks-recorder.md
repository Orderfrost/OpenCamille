# Lifecycle、Hooks、Recorder

## 为什么单独说明

这三个模块位置接近，但职责不同：

```text
Lifecycle = 定义生命周期时间线和 HookPoint
EventBus = Lifecycle 内部的事件分发机制
Hooks = 在固定 HookPoint 执行扩展回调
Recorder = 持久化运行记录和恢复材料
```

## Lifecycle

Lifecycle 是事件名称的唯一来源。

Run timeline：

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

只有 AgentLoop 和 Runtime Control 直接 emit。

## EventBus

EventBus 是进程内 pub/sub，不是分布式消息系统。

v0.1 只需要：

```text
emit(event)
subscribe(listener) -> unsubscribe
```

不做：

```text
Kafka / Redis Streams / NATS
RxJS
event sourcing
priority middleware
把内部 debug 细节都事件化
```

## Hooks

HookPoint：

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

v0.1：

```text
全部埋点
默认只观察
before_tool_call 可 deny/modify args
after_tool_call 可 modify result
before_user_message 可 deny/modify text
before_message_display 只允许修改展示内容
```

Hooks 不通过 EventBus 阻塞流程。需要 block/modify 的 hook 由 AgentLoop 或 Runtime Control 在固定点同步调用。

## Recorder

Recorder 写：

```text
.opencamille/runs/<runId>/
  events.jsonl
  transcript.jsonl
  checkpoint.json
```

语义：

```text
events.jsonl      机器读，timeline truth，用于 eval / replay / debug
transcript.jsonl  人读，可读会话记录，用于 UI / export / demo
checkpoint.json   resume source，用于恢复 live Session
```

Recorder 直接订阅 EventBus。Recorder 不依赖 Hooks，Hooks 失败不能影响 Recorder 记录。

Resume：

```text
Runtime Control reads checkpoint.json
  -> rehydrate live Session
```

Replay：

```text
read events.jsonl
  -> show timeline
```

Eval：

```text
external evaluator reads events.jsonl
  -> may also inspect transcript/workspace artifacts
```
