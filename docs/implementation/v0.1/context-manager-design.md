# ContextManager 设计说明

> 作用：指导 Task 6 的开发、代码审阅和后续架构评估。本文描述的是 v0.1 的目标边界，不要求一次实现未来 Memory、Skills、MCP 的完整能力。

## 1. 设计结论

ContextManager 是 Agent Runtime 层的上下文组装、预算记录、内存缓存和恢复协作组件。

它不是一个纯函数字符串拼接器，也不是一个通用加载框架。它的最小合理职责是：

```text
收集当前已知来源
读取少量固定本地规则文件
把来源映射到 system/tools/messages
计算 context budget
判断 context_overflow
维护 session 级 context snapshot 缓存
支持从 checkpoint 中恢复 context snapshot
```

它明确不负责：

```text
调用 LLM provider
执行 tools
扫描 MCP server
扫描 Skill 目录
检索 memory
压缩 memory
修改 Session
写 Recorder 文件
做权限判断
```

如果后续模块需要把内容放入上下文，应先把内容整理成 `ContextSource`，再交给 ContextManager 组装。

## 2. 为什么不是纯函数

纯函数式 `build(input): ContextAssembly` 看起来最简单，但会留下几个实际问题：

```text
每轮重复读取规则文件
无法知道哪个来源导致 context 变化
无法向 Recorder 提供可恢复 snapshot
无法解释 token/char budget 被谁消耗
AgentLoop 需要自己判断 context 是否可复用
```

这些问题都属于“上下文本身”的生命周期，不属于 AgentLoop、Memory、Recorder 或 ProviderAdapter。

因此 ContextManager 应该是一个小型有状态对象，但内部保持简单，不拆出 `ContextLoader`、`SourceRegistry`、`BudgetService` 等独立模块。

## 3. 核心模型

### ContextSource

ContextSource 表示“一个上下文来源”。设计按来源扩展，不按参数字段扩展。

```ts
type ContextSourceKind =
  | "builtin"
  | "config"
  | "file"
  | "session"
  | "tools"
  | "mcp"
  | "skills"
  | "memory";

type ContextTarget = "system" | "tools" | "messages";

type ContextSource = {
  id: string;
  kind: ContextSourceKind;
  target: ContextTarget;
  priority: number;
  content?: string;
  tools?: ToolDefinition[];
  messages?: Message[];
  fingerprint: string;
};
```

字段语义：

```text
id           稳定来源 id，例如 builtin:hard-system、file:AGENTS.md
kind         来源类型，用于 debug 和 budget 归因
target       最终进入 ContextAssembly 的哪个部分
priority     固定排序值，不做复杂规则引擎
content      system 文本内容
tools        ToolDefinition 列表
messages     Message 列表
fingerprint  缓存失效判断依据
```

v0.1 不需要给 ContextSource 增加 loader、watcher、policy、parser、lifecycle hook。来源怎么产生，由当前模块或未来模块负责。

### ContextSnapshot

ContextSnapshot 是某个 session 的一次上下文组装结果。

```ts
type ContextSnapshot = {
  sessionId: string;
  version: number;
  sources: Array<{
    id: string;
    kind: ContextSourceKind;
    target: ContextTarget;
    fingerprint: string;
    chars: number;
  }>;
  context: ContextAssembly;
  budget: ContextBudget;
  createdAt: string;
};
```

Snapshot 用途：

```text
ContextManager 内存缓存
Recorder checkpoint 持久化
resume 后快速恢复 context
debug 某条规则/记忆/工具信息为什么进入上下文
```

Snapshot 不能保存 secret。来自 Config 的内容必须是摘要，不允许包含 `apiKey`、`authToken`、完整 headers。

### ContextBudget

v0.1 使用字符估算，不做 tokenizer 级精确计算。

```ts
type ContextBudget = {
  maxChars: number;
  usedChars: number;
  bySource: Array<{
    sourceId: string;
    chars: number;
  }>;
  overflow: boolean;
};
```

规则：

```text
hard system 不裁剪
tools 不裁剪，但计入预算
messages 不偷偷截断
超过 maxChars 返回 context_overflow
```

ContextManager 只判断 overflow，不负责压缩。overflow 后由 AgentLoop 调 MemoryManager 压缩，再调用 ContextManager rebuild。

## 4. 来源分类与映射

### 必然来源

这些来源由 ContextManager 内部创建：

```text
builtin:hard-system       -> system
builtin:safety-rules      -> system
config:provider-runtime   -> system
session:messages          -> messages
```

`builtin:hard-system` 包含 OpenCamille 的最高优先级行为边界。用户规则、项目规则、Memory、Skill body 都不能覆盖它。

`config:provider-runtime` 只能包含非敏感摘要，例如：

```text
active provider name
provider protocol
model
maxTurns
maxOutputTokens
permissionDefault
```

不要包含：

```text
apiKey
authToken
headers
local file absolute secret path
```

### 可选文件来源

v0.1 允许 ContextManager 读取少量固定规则文件，避免现在拆出额外 loader。

默认候选：

```text
AGENTS.md
Agent.md
```

行为：

```text
文件不存在 -> 跳过
文件为空 -> 跳过
读取失败 -> v0.1 可跳过并记录 source warning；不要中断会话
```

当前不做：

```text
递归扫描
glob 匹配
路径级规则继承
远程规则加载
规则冲突求解
```

文件规则进入 `system`，不是权限 enforcement。真实权限仍由 PermissionEngine 判断。

### 外部模块来源

未来模块以 `extraSources` 形式输入：

```text
Tools   -> tools source
MCP     -> mcp tools source
Skills  -> skill summaries / active skill body source
Memory  -> session summary / persistent memory / retrieved memory source
```

这些模块的加载、扫描、检索、压缩不属于 ContextManager。

## 5. 组装顺序

v0.1 使用固定 priority，不做动态优先级引擎。

建议顺序：

```text
100 builtin:hard-system
110 builtin:safety-rules
200 config:provider-runtime
300 file:AGENTS.md / file:Agent.md
400 tools:builtin / tools:mcp / tools:skill-tool
500 skills:summaries
510 skills:active-body
600 memory:session-summary
610 memory:persistent
620 memory:retrieved
700 session:messages
```

映射规则：

```text
target system   -> 按 priority 拼接为 ContextAssembly.system
target tools    -> 合并为 ContextAssembly.tools
target messages -> 合并为 ContextAssembly.messages
```

system 拼接时每个来源必须有清晰 header：

```text
<context-source id="file:AGENTS.md" kind="file">
...
</context-source>
```

这样便于调试和后续架构审阅。header 不是安全边界，只是来源标注。

## 6. 缓存与失效

ContextManager 按 `sessionId` 维护内存 snapshot。

每次 build：

```text
1. 收集当前 sources
2. 计算每个 source fingerprint
3. 和已有 snapshot 的 fingerprints 对比
4. 如果完全一致，返回 cached context
5. 如果任一 source 变化，重新组装 context
6. 计算 budget
7. 返回 ok 或 context_overflow
```

fingerprint 建议：

```text
builtin source     hash(content)
config source      hash(protocol/model/runtime摘要)
file source        hash(file content)
tools source       hash(tool names + descriptions + schema)
memory source      hash(content)
session messages   hash(message count + last message id + last message content)
```

v0.1 可以用 Node `crypto.createHash("sha256")`。不要引入新依赖。

缓存只优化重复 build，不改变语义。任何来源变化都必须重新组装。

## 7. 恢复与 Recorder 协作

Recorder 不拥有 context 逻辑，但 checkpoint 应能保存 ContextSnapshot。

恢复流程：

```text
Runtime Control 读取 checkpoint
ContextManager.restore(snapshot)
下一轮 build 时重新收集 sources
如果 fingerprints 一致，复用 restored snapshot
如果 fingerprints 不一致，重新组装
```

这避免每次 resume 都从零构造，同时不会在规则文件或 session 变化后使用过期 context。

Checkpoint 中的 snapshot 只能保存脱敏后的 context。ConfigReader.redactSecrets() 应在写 checkpoint 前统一处理已知 secret。

## 8. ContextBuildInput 与结果

推荐 v0.1 接口：

```ts
type ContextBuildInput = {
  session: Session;
  config: Config;
  extraSources?: ContextSource[];
  ruleFiles?: string[];
  maxChars?: number;
};

type ContextBuildResult =
  | {
      status: "ok";
      context: ContextAssembly;
      snapshot: ContextSnapshot;
    }
  | {
      status: "context_overflow";
      reason: string;
      snapshot: ContextSnapshot;
    };
```

`ruleFiles` 默认值：

```text
["AGENTS.md", "Agent.md"]
```

`maxChars` 默认值应保守，例如 120_000。后续可从 provider/model context window 推导，但 v0.1 不做 tokenizer 级映射。

ContextManager 类：

```ts
class ContextManager {
  build(input: ContextBuildInput): ContextBuildResult;
  restore(snapshot: ContextSnapshot): void;
  snapshot(sessionId: string): ContextSnapshot | undefined;
}
```

## 9. 与其他模块边界

### AgentLoop

AgentLoop 使用 ContextManager：

```text
build context
if context_overflow:
  emit context_overflow
  call Memory.compact()
  build context once more
provider.stream(context)
```

AgentLoop 不拼 system，不读规则文件，不计算 budget。

### Runtime Control

Runtime Control 拥有 Session live state。ContextManager 只读取 `Session`。

ContextManager 不 append message、不修改 status、不清理 pendingApproval。

### Recorder

Recorder 写 checkpoint 时可以保存 ContextSnapshot，但不解释 snapshot。

Recorder 不判断 context 是否过期。

### Tools / MCP / Skills / Memory

这些模块未来产出 `ContextSource`：

```text
Tools 提供 ToolDefinition source
MCP 提供 MCP ToolDefinition source
Skills 提供 skill summaries / active skill body source
Memory 提供 summary / persistent / retrieved source
```

ContextManager 不知道这些模块内部如何加载。

### ProviderAdapter

ProviderAdapter 只接收 `ContextAssembly`。

协议映射由 ProviderAdapter 完成：

```text
Anthropic Messages: ContextAssembly.system -> system
OpenAI Responses:   ContextAssembly.system -> instructions
OpenAI Chat:        ContextAssembly.system -> first system message
```

ContextManager 不处理 provider-specific wire format。

## 10. 安全与冲突规则

上下文文本不等于权限。

```text
AGENTS.md / Agent.md / Memory / Skill body 是模型指导
PermissionEngine 才是 allow/ask/deny 执行边界
```

冲突规则：

```text
hard system 永远最高优先级
后续来源不得声明覆盖 hard system
项目/用户/记忆/skill 有冲突时不做自动裁决，按来源 header 保留
执行权限冲突交给 PermissionEngine
```

如果某个来源包含明显危险或越权内容，v0.1 不在 ContextManager 内做安全分类。后续可以在读取来源的模块中做校验。

## 11. v0.1 不做

```text
tokenizer 精确 token 统计
自动 history 截断
Memory 压缩
Memory 检索
Skill 自动触发
MCP server discovery
文件 glob/递归规则扫描
path-scoped rules
规则冲突求解引擎
ContextSource loader plugin
多级 SourceRegistry
```

这些能力可以后续接入，但不应进入 Task 6。

## 12. Task 6 开发验收

Task 6 应实现：

```text
ContextManager class
ContextSource / ContextSnapshot / ContextBudget 类型
build()
restore()
snapshot()
builtin hard system source
config summary source
optional rule file source
session messages source
extraSources 合并
固定 priority 组装
字符 budget 统计
context_overflow
```

测试至少覆盖：

```text
system 按来源顺序组装
rule file 不存在时跳过
rule file 存在时进入 system 并带 source header
tools sources 合并进入 ContextAssembly.tools
session conversationHistory 进入 messages
config source 不泄漏 apiKey/authToken
相同 fingerprint 时复用 snapshot
source 变化时重新组装
restore 后 fingerprint 一致时复用 snapshot
超过 maxChars 返回 context_overflow 且不截断 messages
```

验收命令：

```text
pnpm test tests/unit/context.test.ts
pnpm test
pnpm run typecheck
pnpm run lint
```

