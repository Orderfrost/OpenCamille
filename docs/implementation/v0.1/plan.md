# v0.1 实施计划

> 给 agentic workers：按任务顺序实现。每个任务完成后必须更新 `docs/implementation/v0.1/checklist.md`。不要跳任务，不要扩大 scope。

## 目标

实现 OpenCamille v0.1 的最小完整 Agent Harness：

```text
CLI
Runtime Control
AgentLoop + ContextManager
Tools + Permission
Skills
stdio MCP tools
Lifecycle/EventBus
Hooks 埋点
Recorder
Checkpoint resume
```

## 总体策略

先实现不依赖真实 LLM 的底座，再接真实 provider：

```text
Config/types
Lifecycle/EventBus
Recorder
ProviderAdapter 协议归一化测试
Session/Runtime Control
ContextManager
Tools/Permission
AgentLoop
CLI
真实协议 adapter 手动验证
Skills
MCP
Memory compaction
Resume/approval integration
```

## Task 1: Config + Runtime Types

目标：建立后续模块共享的类型和配置边界。

允许修改：

```text
src/config.ts
tests/unit/config.test.ts
src/types.ts 或 src/runtime-types.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
定义 docs/spec/v0.1-architecture.md 中的 runtime types
Config precedence: built-in defaults < user config < project config < local config < env < CLI flags
使用 zod validation
提供 secret redaction 工具或等价能力
测试 Config precedence 和 redaction
```

禁止：

```text
不要实现 AgentLoop
不要实现 Tools
不要实现 ProviderAdapter
不要引入新依赖
```

验收：

```text
pnpm test
checklist 已回写
```

## Task 2: Lifecycle/EventBus

目标：实现进程内事件总线和 RunEvent 基础。

允许修改：

```text
src/services/lifecycle.ts
tests/unit/lifecycle.test.ts
src/types.ts 或 src/runtime-types.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
实现 emit(event)
实现 subscribe(listener) -> unsubscribe
支持多个 listener
unsubscribe 后不再接收事件
listener error 行为要明确并测试
定义 v0.1 RunEvent names 常量或 union
```

禁止：

```text
不要引入 RxJS
不要做 distributed event bus
不要做 event sourcing
不要做 priority middleware
```

验收：

```text
EventBus subscribe/unsubscribe 测试通过
pnpm test
checklist 已回写
```

## Task 3: Recorder

目标：实现 events/transcript/checkpoint 文件写入。

允许修改：

```text
src/services/recorder.ts
tests/unit/recorder.test.ts
src/services/lifecycle.ts
src/types.ts 或 src/runtime-types.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
写 .opencamille/runs/<runId>/events.jsonl
写 .opencamille/runs/<runId>/transcript.jsonl
覆盖写 checkpoint.json
Recorder 可订阅 EventBus
secrets/redaction 边界明确
checkpoint schema 允许保存脱敏后的 ContextSnapshot；Recorder 只写入，不解释 context 是否过期
```

禁止：

```text
不要用 SQLite
不要做 remote storage
不要做 OpenTelemetry spans
不要用 events replay 恢复 Session
```

验收：

```text
临时目录测试 JSONL/checkpoint 写入
pnpm test
checklist 已回写
```

## Task 4: ProviderAdapter 协议基线

目标：建立 ProviderAdapter 公共接口和协议归一化测试。当前实现已经接入 OpenAI Responses、OpenAI Chat Completions 兼容接口、Anthropic Messages，不再是单独的测试 provider 任务。

允许修改：

```text
src/infrastructure/provider.ts
tests/unit/provider.test.ts
src/types.ts 或 src/runtime-types.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
定义 ProviderAdapter interface
Config 只接受 openai-responses / openai-chat-completions / anthropic-messages
adapter 只根据 Provider Profile protocol 选择
vendor/name 不参与 adapter 选择
streaming 事件归一化为 model_delta/tool_use/final_message/usage
```

禁止：

```text
不要实现 AgentLoop
不要把厂商 SDK 类型放进公共类型
不要做 ProviderFactory 独立抽象
不要做每厂商 adapter
不要根据厂商名推断协议
```

验收：

```text
provider stream normalization 测试通过
pnpm test
checklist 已回写
```

## Task 5: Session + Runtime Control

目标：实现 live Session 状态写入和 approval pause/resume。

允许修改：

```text
src/runtime-control/session.ts
src/runtime-control/commands.ts
tests/unit/session.test.ts
src/types.ts 或 src/runtime-types.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
create Session
append user/assistant/tool final message
status transition
pendingApproval save/clear
approval approve/deny
checkpoint snapshot shape
checkpoint snapshot shape 后续包含可选 contextSnapshot，由 ContextManager 生成和恢复
```

禁止：

```text
不要调用 provider
不要执行 tools
不要实现 CLI
不要让 AgentLoop 写 ConversationHistory
```

验收：

```text
Runtime Control approval resume 测试通过
pnpm test
checklist 已回写
```

## Task 6: ContextManager

目标：实现 provider-neutral ContextAssembly，并建立 ContextSource、ContextSnapshot、ContextBudget 的最小运行模型。详细设计以 `docs/implementation/v0.1/context-manager-design.md` 为准。

允许修改：

```text
src/agent-runtime/context.ts
tests/unit/context.test.ts
src/types.ts 或 src/runtime-types.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
ContextManager class
ContextSource / ContextSnapshot / ContextBudget 类型
按来源组装 system/tools/messages
builtin hard system source
config provider/runtime summary source，不能泄漏 secret
固定规则文件读取：AGENTS.md / Agent.md，不存在时跳过
extraSources 输入，供未来 Tools/MCP/Skills/Memory 模块接入
session conversationHistory source
固定 priority 组装，不做复杂优先级引擎
字符 budget 统计
context_overflow 返回明确结果，不截断 messages
snapshot(sessionId)
restore(snapshot)
```

禁止：

```text
不要调用 provider
不要偷偷截断 history
不要写 Memory
不要写 Session
不要扫描 MCP server
不要扫描 Skill 目录
不要检索 Memory
不要压缩 Memory
不要拆 ContextLoader/SourceRegistry/BudgetService
```

验收：

```text
ContextAssembly 测试通过
context_overflow 测试通过
rule file fallback 测试通过
snapshot cache/restore 测试通过
secret 不进入 config summary 测试通过
pnpm test
checklist 已回写
```

## Task 7: Tools + Permission + 系统边界

目标：实现工具注册、校验、权限判断、命令执行和路径边界。

允许修改：

```text
src/services/tools.ts
tests/unit/tools.test.ts
src/infrastructure/permissions.ts
tests/unit/permissions.test.ts
src/infrastructure/command.ts
tests/unit/command.test.ts
src/infrastructure/workspace.ts
tests/unit/workspace.test.ts
src/types.ts 或 src/runtime-types.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
Tools.register/list/resolve/runToolCall
zod validation
PermissionEngine allow/ask/deny
approval_required 返回
ToolResult normalization/truncation/redaction
runCommand timeout/exit/stdout/stderr
resolveWorkspacePath 防越界
```

禁止：

```text
不要拆 ToolExecutor
不要等待用户 approval
不要写 ConversationHistory
不要写 Recorder
```

验收：

```text
permission 测试通过
tool validation 测试通过
approval_required 测试通过
command/path 测试通过
pnpm test
checklist 已回写
```

## Task 8: AgentLoop

目标：用 mock ProviderAdapter stream 跑通模型/工具循环。

允许修改：

```text
src/agent-runtime/loop.ts
tests/unit/loop.test.ts
src/agent-runtime/context.ts
src/services/tools.ts
src/services/lifecycle.ts
src/types.ts 或 src/runtime-types.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
调用 ContextManager
调用 ProviderAdapter.stream
emit lifecycle events
收集 model_delta/tool_use/final_message
调用 Tools.runToolCall
approval_required 返回 Runtime Control
context_overflow -> compact once -> retry once
```

禁止：

```text
不要直接写 ConversationHistory
不要拆 ExecutionStrategy
不要拆 TerminationGuard
不要做复杂状态机
```

验收：

```text
AgentLoop final message 测试通过
AgentLoop tool_use 测试通过
approval_required 测试通过
context_overflow retry once 测试通过
pnpm test
checklist 已回写
```

## Task 9: CLI Surface

目标：提供可交互 CLI。

允许修改：

```text
src/surfaces/cli.ts
src/index.ts
tests/unit/cli.test.ts 或等价最小测试
docs/implementation/v0.1/checklist.md
```

要求：

```text
启动 session
读取用户输入
发送给 Runtime Control
订阅 EventBus
打印 model_delta
展示 approval prompt
```

禁止：

```text
不要在 CLI 中调用 provider
不要在 CLI 中执行 tools
不要在 CLI 中写 Recorder
```

验收：

```text
CLI smoke test 或手动验证记录
pnpm test
checklist 已回写
```

## Task 10: 真实协议 adapter 手动验证

目标：对已实现的真实协议 adapter 做手动 integration 验证，补足 provider compatibility 记录；不要再新增一套 provider 抽象。

允许修改：

```text
src/infrastructure/provider.ts
src/config.ts
tests/unit/provider.test.ts
tests/unit/config.test.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
真实 API key 从 Config/local config/env 读取
厂商差异通过 Provider Profile 配置
streaming 映射到 ProviderStreamItem
tool_use 映射到 ToolCall
usage/error 规范化
secrets 不记录
```

禁止：

```text
不要做多 provider parity
不要让 SDK 类型泄漏到 AgentLoop
不要把 API key 写入 Recorder/test snapshot
不要引入 SecretsManager
不要按 vendor 分发 adapter
```

验收：

```text
真实 API 做手动 integration 验证
pnpm test
checklist 已回写
```

## Task 11: Skills

目标：实现 Anthropic Agent Skills 最小加载。

允许修改：

```text
src/services/skills.ts
tests/unit/skills.test.ts
src/services/tools.ts
src/agent-runtime/context.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
扫描 user/project skill dirs
读取 SKILL.md
校验 name/description
维护 SkillIndex
注册 built-in Skill tool
激活 skill body
ContextManager 注入 active skill body
```

禁止：

```text
不要自定义 Skill 协议
不要实现 dynamic command injection
不要实现 fork subagent
不要实现 skill-scoped hooks
```

验收：

```text
SkillIndex 测试通过
Skill activation 测试通过
pnpm test
checklist 已回写
```

## Task 12: stdio MCP tools

目标：实现最小 MCP stdio tools 接入。

允许修改：

```text
src/infrastructure/mcp.ts
tests/unit/mcp-client.test.ts
src/services/mcp.ts
tests/unit/mcp-service.test.ts
src/services/tools.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
stdio JSON-RPC
listTools
callTool
MCP tool -> ToolDefinition
MCP tool 走 Tools.runToolCall
```

禁止：

```text
不要做 HTTP transport
不要做 OAuth/auth
不要做 resources/prompts
不要做 hot reload
```

验收：

```text
mock stdio MCP server 测试通过
pnpm test
checklist 已回写
```

## Task 13: Memory compaction

目标：实现 SessionSummary 和 context overflow 压缩链路。

允许修改：

```text
src/services/memory.ts
tests/unit/memory.test.ts
src/agent-runtime/context.ts
src/agent-runtime/loop.ts
docs/implementation/v0.1/checklist.md
```

要求：

```text
SessionSummary
PersistentMemory 读取接口
Memory.compact()
context_overflow 后 compact once retry once
```

禁止：

```text
不要做 RAG
不要做 vector DB
不要做 WorkingNotes
不要自动长期事实抽取
```

验收：

```text
compaction 测试通过
retry once 测试通过
pnpm test
checklist 已回写
```

## Task 14: 集成收口

目标：跑通 v0.1 demo 闭环。

允许修改：

```text
src/index.ts
src/surfaces/cli.ts
必要的集成测试文件
docs/implementation/v0.1/checklist.md
docs/scope/v0.1.md（仅当验收标准需修正）
docs/spec/v0.1-architecture.md（仅当实现契约需修正）
```

要求：

```text
CLI 启动
真实 provider 手动验证
built-in tools 可用
approval 可暂停/恢复
Skill 可激活
stdio MCP tool 可调用
Recorder 文件可检查
checkpoint resume 可验证
```

禁止：

```text
不要新增 scope 外功能
不要为了 demo 写假架构
不要跳过 Recorder/approval/resume
```

验收：

```text
pnpm test
手动 demo 步骤记录在 checklist
所有 success criteria 已勾选
```
