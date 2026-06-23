# OpenCamille 架构文档

> 状态: 澄清中 | 日期: 2025-06-23
>
> 本文档记录 OpenCamille Agent Harness 的顶层架构设计。
> 模块级实现细节见 [`architecture-modules.md`](architecture-modules.md)。

---

## 1. 定位

OpenCamille 是一个 **Agent Harness**——一个运行 AI Agent 的框架/运行时。

与具体 Agent 的关系：
- **Harness（框架）**: 提供 Agent 运行所需的基础设施（循环、工具、权限、记忆、模型调用）
- **Agent（实例）**: 运行在 Harness 之上的具体 AI，有自己的 system prompt、工具集、行为规则

类比：Harness = 操作系统，Agent = 运行在操作系统上的程序。

---

## 2. 待澄清的顶层架构问题

### 2.1 整体分层

Agent Harness 应该分几层？每层的职责是什么？

参考：
- Claude Code: 4 个接口汇聚到一个统一的 `queryLoop`
- OpenClaw: Plan → Review → Execute 三阶段流水线
- 典型分层: 接口层 → 编排层 → 执行层 → 基础设施层

### 2.2 接口层

Harness 如何接收外部输入、输出结果？

- CLI 是唯一接口，还是预留 API/WebSocket？
- 输入是单次命令还是持续会话？
- 输出是纯文本还是结构化（流式文本 + 工具调用状态）？

### 2.3 与模型的关系

Harness 如何与 LLM 通信？

- 直接调用 SDK，还是有中间层？
- 模型调用是 Harness 的核心循环的一部分，还是独立的服务？
- 多模型切换是在哪一层处理的？

### 2.4 与外部系统的连接

Agent 通过什么机制访问外部世界？

- 工具系统是唯一的出口，还是有其他通道？
- 文件系统、网络、shell——哪些是 Agent 可直接访问的？
- 权限边界在哪里？

### 2.5 会话生命周期

一次 Agent 会话从开始到结束的完整生命周期是什么？

- 会话如何创建、如何恢复、如何结束？
- 中间状态如何持久化（断点续跑）？

### 2.6 已确认的模块（见 architecture-modules.md）

以下模块已在之前的澄清中确定了具体实现方式，将在顶层架构确定后嵌入：

- Agent Loop (ReAct + 可组合原语)
- PromptManager (三层拼接 → PromptAssembly)
- Provider Adapter (Anthropic/OpenAI 翻译层)
- 工具系统 (自定义 ToolDef, zod-based)
- 权限引擎 (Deny-first, 三级分类)
- 记忆系统 (三层: 工作 + 压缩 + 持久)
- Streaming (混合模式)
- 错误处理 (错误直接传递模型)
