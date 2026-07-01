# AI 开发规范

本文件给 Codex、Claude Code 或其他 AI Agent 使用。任何 AI 在修改 OpenCamille 前必须先读本文件。

## 项目定位

OpenCamille 是 Agent Harness，不是单一垂直助手，也不是 Claude Code clone。

Harness 负责底层运行框架：

```text
Runtime Control
Agent Runtime
Tools
Skills
Memory
MCP
Lifecycle
Hooks
Recorder
ProviderAdapter
PermissionEngine
```

当前权威架构是 [顶级架构](./architecture.md)。当前实现边界是 [v0.1 Scope](./scope/v0.1.md)。

## 必读顺序

写代码前：

1. [顶级架构](./architecture.md)
2. [v0.1 Scope](./scope/v0.1.md)
3. [v0.1 架构实现规范](./spec/v0.1-architecture.md)
4. [v0.1 实施计划](./implementation/v0.1/plan.md)
5. 当前任务对应的 `docs/architecture/*.md`

改文档前：

1. [文档索引](./README.md)
2. 要修改的文档
3. 相关 scope/spec/architecture 文档

## 工作规则

- 所有包管理命令必须使用 `pnpm`。
- TypeScript 必须保持 strict。
- 信任边界必须使用 `zod` 做 runtime validation。
- 优先最小实现，不写 speculative abstraction。
- 不新增未确认模块。
- 不为未来可能性写空接口、空目录、空类。
- 不重构无关代码。
- 不执行 git 写操作：`git add`、`git commit`、`git push`、`git branch`、`git merge`、`git rebase` 等都只建议，由开发者手动执行。

## 架构规则

- Runtime Control 是 live Session 和 ConversationHistory 的唯一写入者。
- Agent Runtime 只保留 AgentLoop 和 ContextManager。
- v0.1 不拆 ToolExecutor，工具执行入口是 `Tools.runToolCall()`。
- Provider 细节必须在 `ProviderAdapter` 后面。
- 权限判断发生在 side-effect tool 执行前。
- `PermissionEngine` 只返回 `allow | ask | deny`，不等待用户。
- EventBus 用于观察、streaming、recording，不替代状态源。
- Hooks 在固定 HookPoint 同步执行，不能变成第二套控制流。
- Recorder 写 events/transcript/checkpoint，但不修改 live Session。
- Resume 读取 checkpoint，不通过 event sourcing 恢复。
- Skills 必须遵循 Anthropic Agent Skills，不自定义 Skill 协议。
- MCP 必须遵循官方 MCP 协议，不自定义 MCP-like 协议。
- Config 必须有确定优先级，secrets 不能进入 Recorder。

## v0.1 禁止实现

```text
Web UI
API surface
IDE integration
Subagents
RAG / vector memory
完整 plugin package format
MCP HTTP/auth/resources/prompts
OpenTelemetry spans
SQLite/remote storage
真实 OS/container sandbox
ToolExecutor
ExecutionStrategy
TerminationGuard
AgentRuntimeEvent
FileSystem module
Shell class
Storage abstraction
ProviderFactory
PolicyStore
SecretsManager
NetworkClient
```

## 如果发现架构冲突

不要直接改架构。必须先输出：

```text
冲突位置
为什么冲突
最小解决方案
是否影响 scope/spec
需要 owner 确认的问题
```

得到确认后才能改架构文档。

## Definition of Done

一个实现任务完成时必须满足：

```text
属于当前 scope 或明确用户请求
没有新增未确认模块
没有越过模块边界
有最小测试或可运行验证
pnpm test 通过，或说明为什么不能运行
如果行为/架构/scope 变化，已更新 docs
明确说明跳过了什么
```
