# Layer 2: Session

> OpenCamille 架构 · 第 2 层

## 职责

会话容器、对话历史所有者、生命周期管理。

## 模块

```
Session:
  ├── ConversationHistory  Message[] 唯一所有者
  ├── Lifecycle State      idle → active → paused → ended
  ├── Agent Reference      持有当前 Agent 实例引用
  ├── Agent Swap           运行时替换 Agent（保留对话历史）
  ├── Skill Loading        加载/卸载 Skill 能力包
  └── Persistence          触发 Infra.SessionStore（每轮结束追加 JSONL）
```

## 状态机（4 状态）

```
idle → active → paused → ended
         ↑         │
         └─────────┘
```

**Agent 内部等待**（Agent Loop 内的阻塞调用，不改变 Session 状态）：

| 场景 | 机制 |
|------|------|
| 权限确认 | `session.waitForApproval(prompt)` → 弹确认 UI → resolve |
| Agent 问用户 | `session.waitForUserInput(prompt)` → 等待输入 |
| Plan 审阅 | `session.waitForPlanApproval(plan)` → 确认/拒绝 |

这些是 Agent 执行中的暂停点。Session 状态保持 `active`。

## 对话历史

- `this.messages: Message[]` 是完整消息数组的**唯一所有者**
- MemoryStore 可**只读引用**，不持有副本
- 持久化：每轮 Agent Loop 结束追加到 `Infra.SessionStore`（JSONL 文件）

## Agent 引用与替换

- Session 持有当前 Agent 实例的引用
- 可运行时替换 Agent（保留对话历史）
- **Agent 切换 = Skill 切换**：不换 L1 身份（Token 缓存保留），换 L2 能力注入

## 创建流程

```
1. Interface / user 发起新会话
2. SessionManager.createSession(config)
3. 调用 AgentFactory(config) → Agent 实例
4. Session 持有 Agent 引用
5. Session 进入 active 状态
```

## 依赖

↓ Agent · Infra.SessionStore
