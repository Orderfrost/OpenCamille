# Layer 1: Surfaces

## 模块定位

Surfaces 是 OpenCamille 的用户或外部系统入口。v0.1 只实现 CLI，Web/API/IDE 都延后。

```text
Surfaces
  CLI
  Web 延后
  API 延后
```

## 为什么需要 Surfaces

如果 CLI 直接调用 provider、tools 或 recorder，后续 Web/API 会重复业务逻辑，状态也会分散。Surfaces 的存在是为了把“交互方式”和“Agent 运行逻辑”拆开。

## CLI 职责

```text
读取用户输入
解析 flags
把普通消息交给 Runtime Control
把 slash command / 内部 command 交给 CommandDispatcher
订阅 Lifecycle/EventBus
渲染 model_delta streaming
展示 tool status
展示 approval prompt
展示 final assistant message
```

## CLI 不能做

```text
不能直接调用 ProviderAdapter
不能直接执行 Tools.runToolCall()
不能直接修改 ConversationHistory
不能直接写 events.jsonl / transcript.jsonl / checkpoint.json
不能直接读取 Skills/MCP/Memory 内部状态
```

## v0.1 实现路径

```text
CLI start
  -> load Config
  -> Runtime Control create/resume Session
  -> subscribe EventBus
  -> read user input
  -> Runtime Control handleInput()
```

approval：

```text
EventBus emits approval_requested
  -> CLI prompt user
  -> Runtime Control resolveApproval(allow/deny)
```

## 验收标准

```text
能启动一个 CLI session
能输入用户消息
能看到 streaming 输出
能看到 approval prompt
CLI 不包含 provider/tool/recorder 的业务实现
```
