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

ContextManager 是 Agent Runtime 层的上下文组装、预算记录、内存缓存和恢复协作组件。它不是通用加载框架，也不是纯字符串拼接函数。

核心职责：

```text
收集当前已知 ContextSource
读取少量固定规则文件
把来源映射到 system/tools/messages
计算 context budget
判断 context_overflow
维护 session 级 ContextSnapshot 缓存
支持从 checkpoint 恢复 ContextSnapshot
```

输出：

```text
ContextAssembly
  system
  tools
  messages
```

如果超出上下文预算，返回 `context_overflow`，不要偷偷截断。

ContextManager 允许读取的本地来源只限固定规则文件，例如 `AGENTS.md` / `Agent.md`。复杂来源由其他模块产出 `ContextSource`：

```text
Tools   -> ToolDefinition source
MCP     -> MCP ToolDefinition source
Skills  -> skill summaries / active skill body source
Memory  -> session summary / persistent memory / retrieved memory source
```

ContextManager 不做：

```text
不调用 provider
不执行 tools
不扫描 MCP server
不扫描 Skill 目录
不检索 Memory
不压缩 Memory
不修改 Session
不写 Recorder 文件
不做权限判断
```

详细设计与 Task 6 验收见：

```text
docs/implementation/v0.1/context-manager-design.md
```

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
