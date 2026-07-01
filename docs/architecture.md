# OpenCamille 顶级架构

> 状态：已确认草案  
> 更新日期：2026-06-29  
> 作用：这是 OpenCamille 的长期顶级架构文档。v0.1 只实现其中最小可运行切片，具体边界见 `docs/scope/v0.1.md` 和 `docs/spec/v0.1-architecture.md`。

## 1. 项目定位

OpenCamille 是一个 **Agent Harness**，不是某个单一垂直助手，也不是 Claude Code 的简单复刻。

Harness 负责提供 Agent 运行所需的底层框架能力：

```text
会话控制
上下文组装
模型调用适配
工具系统
权限控制
MCP 接入
Skill 加载
记忆与压缩
生命周期事件
Hooks / Plugins 扩展点
运行记录、Replay、Resume、外部 Eval 证据
```

Agent 是运行在 Harness 上的一次配置化执行实体。OpenCamille 的重点不是先追求 Coding Agent 效果超过顶级产品，而是证明自己能从底层构建一个可控、可扩展、可审计的 Agent Runtime。

## 2. 顶级分层

最终确认的顶级分层是：

```text
1. Surfaces
2. Runtime Control
3. Agent Runtime
4. Services
5. Infrastructure
```

依赖方向：

```text
Surfaces
  -> Runtime Control
  -> Agent Runtime
  -> Services
  -> Infrastructure
```

事件方向：

```text
AgentLoop / Runtime Control
  -> Lifecycle/EventBus
  -> Surfaces
  -> Recorder
  -> Hooks / Plugins
```

设计原则：

- **状态写入集中**：live Session 和 ConversationHistory 只能由 Runtime Control 写入。
- **执行循环收敛**：Agent Runtime 只保留 AgentLoop 和 ContextManager，不拆一堆早期空抽象。
- **能力放 Services**：Tools、Skills、Memory、MCP 等属于 Agent 能力；Lifecycle、Hooks、Plugins、Recorder 属于运行时服务。
- **底层边界放 Infrastructure**：Provider、Config、Permission、MCP 传输、命令执行、路径边界属于底层。
- **事件用于观察，不替代状态源**：Resume 靠 checkpoint，不靠 replay events 重建状态。

## 3. Surfaces

### 职责

Surfaces 是用户或外部系统进入 OpenCamille 的入口。

```text
Surfaces
  CLI
  Web 延后
  API 延后
```

v0.1 只实现 CLI。

CLI 负责：

```text
读取用户输入
解析 CLI flags
把用户消息或 command 交给 Runtime Control
订阅 Lifecycle/EventBus 并渲染 streaming 输出
展示 tool approval prompt
展示最终 assistant message
```

### 为什么需要这一层

如果 CLI 直接调用 AgentLoop、Tools 或 Provider，后续 Web/API/IDE 会重复实现同样逻辑，状态也会分散。Surface 必须很薄，只负责交互，不拥有核心运行逻辑。

### 边界

Surfaces 不能：

```text
直接调用 ProviderAdapter
直接执行 tools
直接写 Recorder
直接修改 ConversationHistory
直接读取 Skills/MCP/Memory 内部状态
```

### 实现路径

v0.1：

```text
CLI reads input
  -> Runtime Control / CommandDispatcher
  -> subscribe EventBus for streaming
  -> prompt user when approval_requested
```

延后：

```text
Web UI
API server
IDE integration
多 Surface 共享同一个 Session
```

## 4. Runtime Control

### 职责

Runtime Control 是 live run/session 的状态权威与流程协调层。

```text
Runtime Control
  Session
  ConversationHistory
  CommandDispatcher
  approval pause/resume
  status / pendingApproval / budget
```

它负责：

```text
创建、恢复、关闭 Session
拥有 live Session
拥有 ConversationHistory
维护 Session status
维护 pendingApproval
维护 budget / turn count
路由用户 Commands
调用 AgentLoop 执行一轮
处理 approval_required 暂停与恢复
从 Recorder checkpoint 恢复 live Session
```

### 为什么需要这一层

Agent Harness 的核心风险是状态来源混乱。如果 AgentLoop、Tools、Recorder、CLI 都能写 ConversationHistory，那么 approval、resume、replay、debug 会很快失控。

Runtime Control 的作用是把 live state 的写入权收敛到一个地方。

### 边界

Runtime Control 不负责：

```text
组装 LLM context
调用 provider SDK/API
执行 tools
注册 tools
扫描 skills
写 durable trace 文件
实现 MCP 协议
```

### v0.1 实现方式

v0.1 不拆 `RunState`、`ApprovalState`、`BudgetState` 三个类。直接使用一个 `Session` 对象：

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

### 关键契约

```text
Runtime Control 是 live ConversationHistory 的唯一写入者。
AgentLoop 返回 turn result，不直接改 Session。
Tools 返回 tool result，不直接改 Session。
Recorder 记录 checkpoint，不拥有 live Session。
```

## 5. Agent Runtime

### 职责

Agent Runtime 是智能执行循环。

```text
Agent Runtime
  AgentLoop
  ContextManager
```

### 为什么只保留两个模块

真实 Agent Harness 的核心就是：

```text
build context
call model
stream output
handle tool use
append result
repeat
```

过早拆出 `ToolExecutor`、`ExecutionStrategy`、`TerminationGuard`、`StateMachineEngine` 会制造空壳模块。v0.1 先把执行循环写清楚，后续复杂度真的出现时再拆。

### AgentLoop

AgentLoop 负责：

```text
调用 ContextManager.build()
调用 ProviderAdapter.stream()
接收厂商无关 stream items
emit model/tool/turn lifecycle events
聚合 model_delta 成 final assistant message
处理 tool_use
调用 Tools.runToolCall()
遇到 approval_required 时返回 Runtime Control
遇到 context_overflow 时触发 Memory.compact() 一次，并重试一次
检查 max turns / budget / abortSignal
```

AgentLoop 不负责：

```text
持久化 Recorder 文件
等待用户 approval
直接修改 live Session
实现 tool registry
实现 provider SDK 细节
```

### ContextManager

ContextManager 负责组装厂商无关的 `ContextAssembly`，并维护上下文预算、ContextSnapshot 缓存和 checkpoint 恢复协作。

它不是通用加载框架，也不是纯字符串拼接函数。它的输入按来源组织：

```text
ContextSource
  builtin
  config
  file
  session
  tools
  mcp
  skills
  memory
```

输出：

```text
ContextAssembly
  system
  tools
  messages
```

ContextManager 可以自己处理少量稳定来源：

```text
builtin hard system / safety rules
config provider/runtime 非敏感摘要
固定规则文件 AGENTS.md / Agent.md
session conversationHistory
```

复杂来源由其他模块产出 `ContextSource` 后交给 ContextManager：

```text
Tools   -> ToolDefinition source
MCP     -> MCP ToolDefinition source
Skills  -> skill summaries / active skill body source
Memory  -> session summary / persistent / retrieved memory source
```

ContextManager 维护 `ContextSnapshot`：

```text
source fingerprints
assembled ContextAssembly
ContextBudget
createdAt
```

用途：

```text
避免每轮重复读取和重组不变来源
解释每个 source 的 budget 消耗
给 Recorder checkpoint 提供可恢复 snapshot
resume 后按 fingerprint 判断复用或重建
```

ContextManager 不负责：

```text
调用 LLM API
执行 tools
扫描 MCP server
扫描 Skill 目录
检索 Memory
压缩 Memory
写 Memory
写 Recorder
修改 ConversationHistory
做权限判断
```

上下文超限时，ContextManager 只返回 `context_overflow`，不偷偷截断 messages。AgentLoop 负责调用 Memory.compact() 一次并重试一次。

详细设计见：

```text
docs/implementation/v0.1/context-manager-design.md
```

### 实现路径

v0.1：

```text
while not done:
  result = ContextManager.build({ session, config, extraSources })
  if overflow:
    Memory.compact()
    retry once

  stream = ProviderAdapter.stream(result.context)
  collect deltas/tool_use/final/usage

  if tool_use:
    result = Tools.runToolCall(toolUse)
    if approval_required:
      return to Runtime Control
    return normalized tool result to Runtime Control

  return final assistant message to Runtime Control
```

## 6. Services

Services 是高于底层基础设施的 Harness 能力层。

```text
Services
  Agent Services
    Tools
    Skills
    Memory
    MCP
    Subagents 延后

  Runtime Services
    Lifecycle
    Hooks
    Plugins
    Recorder
```

## 7. Agent Services

### 7.1 Tools

#### 职责

Tools 是工具系统入口。

```text
Tools
  register
  list schemas
  resolve
  runToolCall
```

`runToolCall()` 负责：

```text
用 zod 校验输入
调用 PermissionEngine.authorize()
如果 ask，返回 approval_required
如果 allow，执行 callable
规范化 / 截断 / 脱敏 tool result
返回 ok 或 error
```

#### 为什么 Tools 包含 runToolCall

之前讨论过是否拆 `ToolExecutor`。最终决定 v0.1 不拆，因为目前工具执行流程还没有复杂到需要独立模块。把注册和执行都放在 Tools，可以减少文件和概念。

但必须约束边界，避免 Tools 变成 God object。

#### Tools 不能做

```text
不能修改 ConversationHistory
不能等待用户 approval
不能写 Recorder 文件
不能调用 LLM
不能决定 AgentLoop 下一步
不能直接管理 MCP transport
```

#### 实现路径

v0.1 内置工具：

```text
read file
search files
write/edit file
shell command
built-in Skill tool
MCP adapted tools
```

### 7.2 Skills

#### 职责

Skills 管理 Agent 可用的任务知识包。

必须遵循 Anthropic Agent Skills 协议，不自定义一套 Skill 格式。

最小结构：

```text
skill-name/
  SKILL.md
```

`SKILL.md` frontmatter：

```yaml
name: skill-name
description: short trigger-oriented description
```

#### 为什么需要 Skills

Skill 是给 Agent 的“任务知识包”，不是系统插件，也不是 MCP 替代品。它解决的是：某类任务需要额外说明、参考材料、脚本位置、工具 allowlist，但不应该每轮都把所有内容塞进上下文。

#### 设计方式

```text
Skills 维护 SkillIndex:
  name
  description
  path
  allowed-tools

Tools 注册内置 Skill tool:
  Skill(name, arguments)
    -> Skills.activate()
    -> active skill body 进入 ContextManager
```

渐进式加载：

```text
启动时：加载 name + description
触发时：加载 SKILL.md body
需要时：后续再读取 references/scripts/assets
```

#### v0.1 暂缓

```text
dynamic !`command` injection
context: fork subagent
skill-scoped hooks
live file watching
nested monorepo skill discovery
```

### 7.3 Memory

#### 职责

Memory 管理可重新注入上下文的记忆材料。

v0.1 只保留：

```text
SessionSummary
PersistentMemory
```

#### 为什么不做 WorkingNotes

WorkingNotes 容易变成第二套状态系统。当前任务目标、已确认决策、进度等信息先保留在 ConversationHistory 或 SessionSummary 中，不单独建模块。

#### 边界

Memory 不拥有原始 ConversationHistory。ConversationHistory 的唯一 live owner 是 Runtime Control。

Memory 不负责最终 API payload 组装；ContextManager 才负责组装。

#### 实现路径

v0.1：

```text
ContextManager 发现 context_overflow
  -> AgentLoop 调 Memory.compact()
  -> 生成/更新 SessionSummary
  -> ContextManager rebuild once
```

PersistentMemory 先使用显式本地 markdown，不做自动长期学习。

暂缓：

```text
RetrievedMemory
RAG
vector database
local LLM wiki
automatic fact extraction
cross-project autonomous memory
```

### 7.4 MCP

#### 职责

MCP 模块把官方 Model Context Protocol 暴露的 primitives 适配进 OpenCamille。

```text
Services / MCP
  MCP tools -> Tools
  MCP resources -> 后续作为 ContextManager source
  MCP prompts -> 后续作为 prompt/template source
```

真正的协议通信放在 Infrastructure / MCPClient。

#### 为什么要拆 Services/MCP 和 Infrastructure/MCPClient

MCPClient 只处理 stdio/JSON-RPC/listTools/callTool。Services/MCP 负责把 MCP tools 变成 OpenCamille 内部 ToolDefinition。这样工具执行、权限、记录都能走统一路径。

#### v0.1

```text
stdio MCP server
list tools
call tools
adapt MCP tools into Tools
permission gate
Recorder records MCP tool calls
```

暂缓：

```text
HTTP transport
resources
prompts
OAuth/auth
sampling
roots
elicitation
hot reload
```

### 7.5 Subagents

顶级架构保留 Subagents，但 v0.1 不实现。

暂缓：

```text
multi-agent orchestration
agent delegation
agent-to-agent messaging
context: fork subagent
```

## 8. Runtime Services

### 8.1 Lifecycle

#### 职责

Lifecycle 定义 OpenCamille 运行过程中的稳定时间线事件和 HookPoint 名称，并拥有一个进程内 EventBus。

Lifecycle 不是 Hook 本身，也不是 Recorder。

#### 为什么需要 Lifecycle

Streaming UI、Recorder、Hooks、Replay、外部 Eval 都需要一条统一的运行时间线。如果每个模块各自定义事件，后续无法稳定回放和分析。

#### Run timeline

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

只有 AgentLoop 和 Runtime Control 直接 emit 事件。

### 8.2 Hooks

#### 职责

Hooks 在固定 HookPoint 执行用户或插件注册的回调。

Hooks 不等于 EventBus subscriber。EventBus 是观察通道，Hooks 是少数可以阻塞/修改流程的同步 gate。

#### HookPoint

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
before_message_display 只改显示
```

不做：

```text
assistant_delta hook
provider_chunk hook
token hook
internal debug hook
```

### 8.3 Plugins

#### 职责

Plugins 是系统级扩展机制，长期用于打包 hooks、tools、skills、commands 等扩展。

#### v0.1 取舍

顶级架构保留 Plugins，但 v0.1 不做完整插件包格式。

v0.1 只允许：

```text
通过本地 config 注册 hooks/tools/skills
```

不做：

```text
plugin manifest
marketplace
remote install
dependency solver
plugin sandbox
version resolver
```

原因：Plugins 很容易吞掉大量时间，而 v0.1 的核心价值是跑通 Harness 底座。

### 8.4 Recorder

#### 职责

Recorder 负责持久化运行证据和恢复材料。

```text
Recorder
  Events
  Transcript
  Checkpoint
```

落盘：

```text
.opencamille/runs/<runId>/
  events.jsonl
  transcript.jsonl
  checkpoint.json
```

语义：

```text
events.jsonl      timeline truth，用于 eval / replay / debug
transcript.jsonl  readable conversation index，用于 UI / export / demo
checkpoint.json   resume source，用于恢复 live Session
```

#### 为什么叫 Recorder 而不是 Tracer

Tracer 更像 observability/span/telemetry，只表达“追踪”。Recorder 还要负责 transcript、checkpoint、resume 材料、replay timeline，因此 Recorder 更准确。

#### 边界

Recorder 不负责：

```text
执行 Hooks
修改 live Session
通过 replay events 恢复状态
执行 Eval
决定 ConversationHistory 内容
```

Resume 读 checkpoint。Replay 读 events。Eval 主要读 events，也可结合 transcript 和 workspace artifacts。

## 9. Infrastructure

Infrastructure 是底层适配和安全边界。

```text
Infrastructure
  ProviderAdapter
  Config
  PermissionEngine
  MCPClient
  CommandRunner
  WorkspacePath
```

### 9.1 ProviderAdapter

负责调用 LLM API/SDK，并把不同厂商的 streaming/tool_use/usage/error 统一成厂商无关 stream items。

输入：

```text
ContextAssembly
```

输出：

```text
model_delta
tool_use
final_message
usage
error
```

ProviderAdapter 不决定上下文内容，不执行 tools，不写 session。

### 9.2 Config

负责加载 env、用户配置、项目配置、CLI flags，并进行 runtime validation。

推荐优先级从低到高：

```text
built-in defaults
env
user config
project config
CLI flags
```

Secrets 只能读取，不能写入 Recorder。

### 9.3 PermissionEngine

只返回：

```text
allow | ask | deny
```

它不等待用户，也不保存 ApprovalState。`ask` 由 Runtime Control 转成 `waiting_approval`。

### 9.4 MCPClient

负责官方 MCP 协议通信。

v0.1：

```text
stdio transport
JSON-RPC
listTools
callTool
```

### 9.5 CommandRunner

不是 Shell class，只是一个小的 `runCommand()` 能力。

必须统一：

```text
cwd
timeout
abortSignal
stdout/stderr limit
exit code
```

原因：不能让 `child_process.spawn` 散落在工具里，否则 timeout、权限、截断、记录都会不一致。

### 9.6 WorkspacePath

不是 FileSystem module，只是一个小的 `resolveWorkspacePath()` 能力。

必须统一：

```text
相对路径解析
workspace root 限制
path traversal 防护
必要时处理 symlink 风险
```

读写文件工具可以直接使用 Node `fs/promises`，但路径必须先经过这个边界。

## 10. v0.1 必须补硬的契约

这些契约不能等实现时临时发挥：

```text
Approval resume:
  Tools.runToolCall() 遇到 ask 返回 approval_required。
  Runtime Control 暂停并恢复同一个 tool call。

Provider streaming:
  ProviderAdapter 隐藏厂商 stream 细节。

Tool result normalization/redaction:
  tool output 进入 model context、Transcript、Events 前必须规范化、截断、脱敏。

Context overflow:
  ContextManager 负责 budget 统计并返回 overflow。
  ContextManager 不截断 messages。
  AgentLoop 调 Memory.compact() 一次，然后重试一次。

Context snapshot:
  ContextManager 维护 session 级 ContextSnapshot。
  Recorder checkpoint 可以持久化脱敏后的 ContextSnapshot。
  Resume 后 ContextManager 按 source fingerprint 决定复用或重建。

Config and secrets:
  Config precedence 确定。
  secrets 不进入 Recorder。
```

## 11. 明确不做的过度抽象

v0.1 不做：

```text
ToolExecutor
ExecutionStrategy
TerminationGuard
AgentRuntimeEvent
ToolCallCoordinator
ContextPipeline
StateMachineEngine
FileSystem module
Shell class
Storage abstraction
Sandbox abstraction
ProviderFactory
PolicyStore
SecretsManager
NetworkClient
OpenTelemetry spans
event sourcing resume
```

这些不是永久否定，而是在 v0.1 阶段没有足够复杂度支撑它们存在。
