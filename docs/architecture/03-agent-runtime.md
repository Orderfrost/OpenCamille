# Layer 3: Agent Runtime

## 模块定位

Agent Runtime 是模型推理和工具调用循环。

```text
Agent Runtime
  AgentLoop
  ContextManager
```

## 为什么只保留 AgentLoop + ContextManager

v0.1 的真实复杂度还不需要独立的 ToolExecutor、ExecutionStrategy、TerminationGuard。过早拆分会导致空模块和控制流分散。

当前选择：

```text
AgentLoop 负责执行循环
ContextManager 负责上下文组装
Tools.runToolCall() 负责工具执行入口
```

## AgentLoop 职责

```text
调用 ContextManager.build()
调用 ProviderAdapter.stream()
emit turn/model/tool lifecycle events
收集 model_delta
聚合 final assistant message
处理 tool_use
调用 Tools.runToolCall()
遇到 approval_required 返回 Runtime Control
遇到 context_overflow 调 Memory.compact() 一次并重试一次
检查 maxTurns / budget / abortSignal
```

## AgentLoop 不做

```text
不直接改 ConversationHistory
不等待用户 approval
不写 Recorder 文件
不实现 provider SDK
不注册/扫描 tools
不扫描 skills
```

## ContextManager 职责

输入：

```text
base prompt
project/user rules
SkillIndex
active skill body
tool schemas
session summary
persistent memory
recent ConversationHistory
```

输出：

```text
ContextAssembly
  system
  tools
  messages
```

如果超出上下文预算，返回 `context_overflow`，不要偷偷截断。

## v0.1 执行路径

```text
build context
  -> provider stream
  -> emit model_delta
  -> collect tool_use
  -> Tools.runToolCall()
  -> return final turn result to Runtime Control
```

## 验收标准

```text
AgentLoop 不直接写 Session
ContextManager 不调用 provider
context_overflow 只 compact once + retry once
Provider-specific 结构不泄漏进 AgentLoop
```
