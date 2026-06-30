# Layer 2: Runtime Control

## 模块定位

Runtime Control 是 live Session 的状态权威和流程协调层。

```text
Runtime Control
  Session
  ConversationHistory
  CommandDispatcher
  approval pause/resume
  status / pendingApproval / budget
```

## 为什么需要 Runtime Control

Agent Harness 最容易失控的地方是状态写入分散。Runtime Control 的核心价值是：

```text
ConversationHistory 只有一个写入者
pendingApproval 只有一个 owner
resume 只有一个入口
AgentLoop 和 Tools 都不直接改 live Session
```

## 职责

```text
创建 Session
恢复 Session
关闭 Session
写入 user/assistant/tool final messages
维护 status
维护 pendingApproval
维护 budget / turnCount
路由 command
调用 AgentLoop
处理 approval_required
从 checkpoint rehydrate live Session
```

## 非职责

```text
不组装 ContextAssembly
不调用 LLM API
不执行 tool callable
不注册 tools
不扫描 skills
不实现 MCP 协议
不直接写 Recorder 文件细节
```

## v0.1 Session 形状

v0.1 不拆多个 state 类，统一放在一个 Session 对象：

```text
Session
  sessionId
  runId
  status
  conversationHistory
  pendingApproval
  budget
  sessionSummary
```

## Approval Resume 链路

```text
Tools.runToolCall()
  -> PermissionEngine returns ask
  -> Tools returns approval_required
  -> AgentLoop returns pending approval
  -> Runtime Control status = waiting_approval
  -> Surface asks user
  -> Runtime Control resumes same tool call
```

关键点：Tools 不等待用户；PermissionEngine 不保存 approval state。

## 验收标准

```text
Runtime Control 是 ConversationHistory 唯一写入者
approval_required 能暂停并恢复同一个 tool call
checkpoint 能恢复出 live Session
CommandDispatcher 不被放入 Agent Services
```
