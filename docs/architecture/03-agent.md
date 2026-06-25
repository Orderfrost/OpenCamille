# Layer 3: Agent

> OpenCamille 架构 · 第 3 层 · 核心层

## 职责

Agent 实体定义 + Agent Loop 驱动 + 子 Agent 管理 + Skill 切换。

## Agent 定义

```
Agent 实例:
  identity:   { name, systemPrompt }     ← 创建时传入，L1 稳定
  tools:      Tool[]                     ← 从 Service.ToolRegistry 选取
  model:      ModelConfig                ← 从 Config 读取，CLI 可覆盖
  rules:      Rule[]                     ← 从 Infra.RuleLoader 加载
  skills:     Skill[]                    ← 当前激活能力集（可增删，L2 变化）
  state:      { mode, turns, tokens }    ← 运行时状态

AgentFactory: config → Agent 实例
```

## Agent Loop（纯 while 循环）

```
Agent.run(input, sessionCtx):

  ContextManager.assemble(agent, session)   ← 获取 ContextAssembly

  while not done:
    ThinkStep   → Infra.ProviderAdapter.chat()
                   • 文本 + tool_calls 完整保留到 messages
                   • thinking 默认折叠展示，可配置 visible=true
                       ↓
    GuardStep   → 1. finish_reason="stop" → 正常结束
                  2. Token/Cost budget 耗尽 → 强制终止
                  3. ExactRepeat: 同工具+同参数 连续 5 次 → 终止
                       ↓
    ActStep     → 无 tool_calls 时跳过
                  有 tool_calls 时 → InterceptorChain → 执行（同 turn Promise.all）
                       ↓
    ObserveStep → 结果写入 Session.messages
                       ↓
    TerminateStep → 判断是否结束，否则继续下一轮
```

**错误处理**: 原始错误传给模型，模型决定重试/替代/报告
**流式输出**: 文本流式 → Interface 渲染；工具调用缓冲 → 完整后执行
**终止条件**: finish_reason stop / budget 耗尽 / ExactRepeat 5x 兜底

## ModeSwitcher

| 模式 | 行为 |
|------|------|
| **default** (ReAct) | Think → Act → Observe 直行 |
| **plan-and-solve** | 先计划再执行 |

**plan-and-solve 流程**:
```
1. 第一轮 Think（plan-mode）: 输出计划 + 子目标列表，不调工具
2. Plan approval: auto（直接执行）/ user（阻塞等人确认）
3. 逐子目标执行: 每个子目标 = 一次 ReAct，结果进入同一 Session.messages
4. 全部完成 → 结束
```

**Todo 工具**：builtin 工具，Agent 管理子目标列表（创建、完成、追加）。

## Skill 切换

**Agent 能力切换通过 Skill 实现**：

```
Agent "default"（身份恒定）
  ├── 用户说 "审查代码"
  │   → SkillLoader.load("code-review")
  │     ├── L1 system prompt 不变（缓存保留）
  │     ├── L2 动态能力: 注入审查专用提示
  │     └── 可选: 替换工具集为审查工具
  │
  └── 用户说 "写测试"
      → SkillLoader.unload("code-review")
      → SkillLoader.load("test-writing")
```

## 子 Agent（Hub-and-Spoke）

```
mainAgent.spawn({ systemPrompt, tools, model, rules }) → 新 Agent 实例

约束:
  • 独立 AgentLoop + 独立上下文窗口（Context Rot 隔离）
  • 不拥有 Task 工具（防深层嵌套）
  • 完成后返回摘要到主 Agent（作为 tool result 插入）
  • 权限 ≤ 主 Agent（bubble 继承）
```

## 行为 Preset

行为 = 模块交叉组合，支持 Preset 预设：

```
Preset "cautious":
  ├── permission: ask mode, mode: plan-and-solve, prompt: 解释决策

Preset "balanced":
  ├── permission: ask-for-write, mode: ReAct, prompt: 简洁汇报

Preset "auto":
  ├── permission: auto, mode: ReAct, prompt: 只报告结果
```

## 依赖

↓ Service · Infra.ProviderAdapter · Infra.MemoryStore

## 参考

- Claude Code: queryLoop while(true), ReAct, hub-and-spoke 子 Agent
- OpenClaw: Plan-Review-Execute, goal-task 循环
