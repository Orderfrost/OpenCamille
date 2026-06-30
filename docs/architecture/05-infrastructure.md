# Layer 5: Infrastructure

## 模块定位

Infrastructure 是底层适配和安全边界层。

```text
Infrastructure
  ProviderAdapter
  Config
  PermissionEngine
  MCPClient
  CommandRunner
  WorkspacePath
```

## ProviderAdapter

为什么存在：

```text
不同 LLM API 的 system/tools/messages、stream、tool_use、usage、error 格式不同。
ProviderAdapter 把这些差异隔离在 Infrastructure。
```

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

不做：

```text
不选择上下文内容
不执行 tools
不写 Session
不写 Recorder
```

当前实现属于 Infrastructure 层的 `Config` 与 `ProviderAdapter` 模块：`Config` 解析并校验当前 Provider Profile，`ProviderAdapter` 根据该 profile 的协议把 provider-specific HTTP/SSE 事件归一化为 `ProviderStreamItem`。

协议选择只看 Provider Profile 的 `protocol` 字段，不根据厂商名推断。`vendor` 只是 profile 元数据，用于标识厂商或兼容端点来源，不参与 adapter 选择。

支持的协议值：

```text
openai-responses
openai-chat-completions
anthropic-messages
```

开发初期不兼容旧协议别名，例如 `openai`、`anthropic`。配置写错应该尽早失败。

选择流程：

```text
createProviderAdapter(config)
  -> read config.provider.protocol
  -> openai-responses: OpenAiResponsesProviderAdapter
  -> openai-chat-completions: OpenAiChatCompletionsProviderAdapter
  -> anthropic-messages: AnthropicMessagesProviderAdapter
```

不要按 provider name 或 vendor 增加分支。例如 `deepseek-openai` 这类 profile 只要声明 `protocol: openai-chat-completions`，就复用 OpenAI Chat Completions adapter。

Provider Profile 字段：

```text
vendor
protocol
baseUrl
version
model
apiKey
authToken
headers
organization
project
beta
```

字段边界：

```text
name          解析后的 active provider 名称，由 Config 注入
vendor        可选元数据，不驱动协议选择
protocol      必填协议，唯一 adapter 选择依据
baseUrl       协议端点根地址，adapter 只拼接固定 path
version/beta  Anthropic 兼容请求头
model         provider 请求体 model 字段
apiKey        Bearer 或 x-api-key
authToken     预留字段，当前 adapter 不发送
headers       透传到 provider 请求头
organization  OpenAI 兼容 organization header
project       OpenAI 兼容 project header
```

Provider Profile 只描述“连接哪个端点、用哪个协议、如何认证”。不要把 `maxTurns`、`permissionDefault`、`temperature` 等运行行为塞进 profile。

Runtime 请求字段：

```text
maxOutputTokens
temperature
topP
topK
stopSequences
reasoningEffort
presencePenalty
frequencyPenalty
seed
toolChoice
parallelToolCalls
responseFormat
user
metadata
store
serviceTier
logprobs
topLogprobs
thinking
```

字段只在对应协议 adapter 中发送：OpenAI Chat Completions 使用 `max_tokens`、`stop`、`response_format` 等字段；OpenAI Responses 使用 `max_output_tokens`、`reasoning` 等字段；Anthropic Messages 使用 `max_tokens`、`stop_sequences`、`top_k`、`thinking` 等字段。

ProviderAdapter 数据流：

```text
ContextAssembly
  -> adapter converts messages/tools/runtime fields to provider request
  -> fetch(baseUrl + protocol path)
  -> read SSE data frames
  -> normalize text deltas, tool calls, usage, final message
  -> yield ProviderStreamItem
```

协议 path：

```text
openai-responses          /responses
openai-chat-completions   /chat/completions
anthropic-messages        /messages
```

工具 schema 由 `ToolDefinition.inputSchema` 的 zod schema 转成 JSON Schema。公共类型中不出现 OpenAI/Anthropic SDK 类型。

当前失败策略：

```text
apiKey 缺失：adapter 构造时抛错
HTTP 非 2xx：抛 Provider request failed with status <code>
SSE data JSON 解析失败：直接抛 JSON parse error
tool call arguments 不是合法 JSON：直接抛 JSON parse error
```

当前 adapter 不消费 `timeoutMs` / `maxRetries`，也不做 SDK retry、错误事件包装或 provider-specific error recovery。后续要做超时/重试时，应优先在这个 Infrastructure 边界内实现，不能泄漏到 AgentLoop。

## Config

为什么存在：

```text
provider key、model、MCP server、permission defaults、project config 都需要确定优先级和校验。
```

优先级从低到高：

```text
built-in defaults
user config
project config
local config
env
CLI flags
```

必须使用 zod 做 runtime validation。

配置模型分两层：

```text
Provider Profile:
  vendor/protocol/baseUrl/version/model/apiKey/authToken/headers/organization/project/beta

Runtime Config:
  maxTurns/maxOutputTokens/temperature/toolChoice/permissionDefault/timeoutMs/maxRetries/...
```

Provider Profile 是厂商和兼容端点的接入描述；Runtime Config 是一次运行的模型参数、权限默认值和控制参数。厂商差异只能通过 profile 配置表达，不能根据厂商名推断协议。

读取与合并流程：

```text
built-in defaults
  -> user config file
  -> project config file
  -> local config file
  -> explicit userConfig/projectConfig/localConfig test hooks
  -> env
  -> CLI flags
  -> zod validation
```

文件约定：

```text
~/.opencamille/config.json
<cwd>/.opencamille/config.json
<cwd>/.opencamille/config.local.json
```

`activeProvider` 先由 CLI flags 覆盖，再由环境变量 `OPENCAMILLE_ACTIVE_PROVIDER` / `OPENCAMILLE_PROVIDER` 覆盖，最后回退到合并后的配置和内置默认值。

环境变量覆盖只映射到当前 active provider 的 profile，不会把 env key 原样传给后续模块。协议相关的默认 key/baseUrl fallback 只按当前 `protocol` 读取：

```text
anthropic-messages:
  ANTHROPIC_API_KEY
  OPENCAMILLE_ANTHROPIC_BASE_URL

openai-responses / openai-chat-completions:
  OPENAI_API_KEY
  OPENCAMILLE_OPENAI_BASE_URL
```

`OPENCAMILLE_PROVIDER_PROTOCOL` 可以覆盖协议，但仍必须是当前支持的三个协议值之一。

Secrets 只能读取，不能写入 Recorder。写 events、transcript、checkpoint 或 model/tool records 前，复用 `ConfigReader.redactSecrets()` 对已知 `apiKey` / `authToken` 值递归脱敏。

## PermissionEngine

为什么存在：

```text
文件写入、shell、MCP tool 等都可能有副作用，必须在执行前统一判断 allow/ask/deny。
```

只返回：

```text
allow | ask | deny
```

不做：

```text
不等待用户
不保存 ApprovalState
不写 Session
不写 Recorder
```

## MCPClient

为什么存在：

```text
MCP 是外部协议，通信细节不应该进入 Services/MCP 或 Tools。
```

v0.1：

```text
stdio transport
JSON-RPC
listTools
callTool
```

## CommandRunner

为什么存在：

```text
不能让 child_process.spawn 散落在各工具中，否则 timeout、abort、stdout/stderr limit、exit code 格式会不一致。
```

实现为小函数：

```text
runCommand()
```

统一：

```text
cwd
timeout
abortSignal
stdout/stderr limit
exit code
```

不要做 Shell class。

## WorkspacePath

为什么存在：

```text
文件读写工具必须防止 path traversal 和 workspace 越界。
```

实现为小函数：

```text
resolveWorkspacePath()
```

统一：

```text
相对路径解析
workspace root 限制
必要时处理 symlink 风险
```

不要做 FileSystem module。读写文件可以直接用 Node `fs/promises`，但路径先过 `resolveWorkspacePath()`。

## v0.1 不做

```text
Storage abstraction
Sandbox abstraction
ProviderFactory
PolicyStore
SecretsManager
NetworkClient
Shell class
FileSystem class
```
