# Layer 1: Interface

> OpenCamille 架构 · 第 1 层

## 职责

用户输入捕获、输出渲染、命令路由。

## 模块

```
Interface 层:
  ├── Input Capture      CLI(stdin) / Web(HTTP)
  ├── Output Render      TUI(ink) / Web(SSE)
  ├── CommandRouter      解析 / 前缀 → 路由到 harness / agent / skill
  └── Multi-Interface    多个界面订阅同一 Session
```

## 命令系统

| 类别 | 例子 | 行为 | 入对话历史 |
|------|------|------|-----------|
| harness | /exit, /pause, /clear | Interface 直接处理 | 否 |
| agent | /goal "...", /mode ... | 注入 Agent 对话 | 是 |
| skill | /code-review | 调用 SkillLoader | 是 |

- CommandRegistry 在 Infrastructure 定义，标记 `availableIn` 和 `category`
- CLI 用 `/` 前缀触发命令，Web 用 UI 控件替代 slash command

## 数据通道

Interface ↔ Session 之间是两条独立单向通道：

```
输入（Interface → Session）:
  session.handleInput(text)
  session.approve()
  session.reject(reason)
  session.loadSkill(name)

输出（Session → Interface）:
  Agent.run() → AsyncGenerator<StreamEvent>（流式文本，实时渲染）
  EventBus → 状态事件（所有界面共享）
```

## 多界面

- 多个 Interface 可订阅同一 Session（CLI 主对话 + Web 只读）
- 初期：`SessionRegistry` 在 Infrastructure，单进程内存，Interface 获取直接引用
- 后期：`SessionHandle` 可换 WebSocket 实现，支持远程 Web UI

## TUI

- CLI 用 Ink（React 组件模型写终端 UI）
- 初期单面板对话 + 状态行，后续扩展多面板（子 Agent 侧栏、工具调用底栏）

## 依赖

↓ Session
