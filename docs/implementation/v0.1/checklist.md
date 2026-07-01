# v0.1 实施 Checklist

> 每个任务完成后必须回写本文件。不要只在最终完成时补。

## 回写格式

每个任务按以下格式填写：

```text
状态:
改动文件:
实现的 spec 条目:
测试命令:
测试结果:
未实现内容:
发现的问题:
是否需要架构讨论:
```

## Task 1: Config + Runtime Types

状态：完成

改动文件：

```text
src/config.ts
tests/unit/config.test.ts
src/types.ts
docs/implementation/v0.1/checklist.md
```

实现的 spec 条目：

```text
Runtime Types
Config precedence: built-in defaults < user config < project config < local config < env < CLI flags
zod validation
secret redaction
```

测试命令与结果：

```text
pnpm test tests/unit/config.test.ts -> passed
pnpm test -> passed
pnpm run typecheck -> passed
pnpm run lint -> passed
```

未实现内容：

```text
已实现 JSON 配置文件发现/读取；`config.local.json` 用于本地密钥，不提交。
Provider 配置已改为 Provider Profile + Runtime Config；真实协议 adapter 已在 Task 4 接入。
```

发现的问题：

```text
无
```

是否需要架构讨论：否

## Task 2: Lifecycle/EventBus

状态：完成

改动文件：

```text
src/services/lifecycle.ts
tests/unit/lifecycle.test.ts
docs/implementation/v0.1/checklist.md
```

测试命令与结果：

```text
pnpm test tests/unit/lifecycle.test.ts -> passed
pnpm test -> passed
pnpm run typecheck -> passed
pnpm run lint -> passed
```

是否需要架构讨论：否

## Task 3: Recorder

状态：完成

改动文件：

```text
src/services/recorder.ts
tests/unit/recorder.test.ts
src/config.ts
src/index.ts
tests/unit/config.test.ts
docs/implementation/v0.1/checklist.md
```

测试命令与结果：

```text
pnpm test tests/unit/config.test.ts tests/unit/recorder.test.ts -> passed
pnpm test -> passed
pnpm run typecheck -> passed
pnpm run lint -> passed
```

未实现内容：

```text
未实现 event replay；Resume 后续只读 checkpoint。
未实现 SQLite/remote storage/OpenTelemetry。
```

发现的问题：

```text
无
```

是否需要架构讨论：否

## Task 4: ProviderAdapter 协议基线

状态：完成

改动文件：

```text
src/infrastructure/provider.ts
src/config.ts
tests/unit/provider.test.ts
tests/unit/config.test.ts
docs/implementation/v0.1/checklist.md
```

测试命令与结果：

```text
pnpm test tests/unit/config.test.ts tests/unit/provider.test.ts -> passed
pnpm test -> passed
pnpm run typecheck -> passed
pnpm run lint -> passed
```

未实现内容：

```text
未实现 AgentLoop；Task 8 处理。
未实现真实 API 手动验证；Task 10 记录 provider compatibility 验证。
未引入厂商 SDK；当前使用 Node fetch 直接调用 OpenAI Responses、OpenAI Chat Completions 兼容接口和 Anthropic Messages。
```

发现的问题：

```text
按 owner 要求，本任务从基础 ProviderAdapter mock 测试扩大为三种真实协议 adapter。
协议只接受 openai-responses / openai-chat-completions / anthropic-messages。
厂商通过 Provider Profile 配置，不按 vendor 分发 adapter。
```

是否需要架构讨论：否

## Task 5: Session + Runtime Control

状态：完成

改动文件：

```text
src/runtime-control/session.ts
src/runtime-control/commands.ts
tests/unit/session.test.ts
docs/implementation/v0.1/checklist.md
```

测试命令与结果：

```text
pnpm test tests/unit/session.test.ts -> passed
pnpm test -> passed
pnpm run typecheck -> passed
pnpm run lint -> passed
```

未实现内容：

```text
未调用 provider；Task 8 AgentLoop 处理。
未执行 tools；Task 7/8 处理。
未实现 CLI；Task 9 处理。
```

发现的问题：

```text
无
```

是否需要架构讨论：否

## Task 6: ContextManager

状态：未开始

目标摘要：

```text
按 docs/implementation/v0.1/context-manager-design.md 实现 ContextManager。
它负责 ContextSource 组装、ContextBudget 统计、ContextSnapshot 缓存和恢复协作。
它可以读取固定规则文件 AGENTS.md / Agent.md，但不扫描 MCP、Skill，不检索/压缩 Memory。
```

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否

## Task 7: Tools + Permission + 系统边界

状态：未开始

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否

## Task 8: AgentLoop

状态：未开始

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否

## Task 9: CLI Surface

状态：未开始

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否

## Task 10: 真实协议 adapter 手动验证

状态：未开始

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否

## Task 11: Skills

状态：未开始

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否

## Task 12: stdio MCP tools

状态：未开始

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否

## Task 13: Memory compaction

状态：未开始

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否

## Task 14: 集成收口

状态：未开始

改动文件：

```text
-
```

测试命令与结果：

```text
-
```

是否需要架构讨论：否
