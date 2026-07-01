# OpenCamille 文档索引

`docs/` 是 OpenCamille 的开发、架构、评审和展示资料的统一入口。这里的权威文档既给人读，也给 AI Agent 读。

## 必读顺序

实现或修改代码前，必须按顺序阅读：

1. [顶级架构](./architecture.md)
2. [v0.1 Scope](./scope/v0.1.md)
3. [v0.1 架构实现规范](./spec/v0.1-architecture.md)
4. [AI 开发规范](./ai-development-guide.md)
5. [v0.1 实施计划](./implementation/v0.1/plan.md)
6. 对应模块文档：`docs/architecture/*.md`

## 目录说明

| 路径 | 作用 |
| --- | --- |
| `architecture.md` | 顶级长期架构，不能为了 v0.1 缩小。 |
| `architecture-modules.md` | 模块索引和快速定位。 |
| `architecture/` | 每层/模块的职责、原因、边界、实现路径。 |
| `scope/` | 版本边界：做什么、不做什么、验收标准。 |
| `spec/` | 版本实现规范：实现 Agent 可直接照着做。 |
| `implementation/` | 每个版本的实施计划、开发要求和任务 checklist。 |
| `development-log/` | 开发日志和历史评审记录。 |
| `research/` | 对其他 Agent Harness 的研究材料。 |
| `adr/` | 难逆、重要、有取舍的架构决策。 |
| `architecture-front/` | 架构展示页和架构图前端资源入口。 |
| `architecture-front/architecture-diagram.html` | 可单独打开和导出的架构图。 |

## 文档权威顺序

如果历史日志、研究材料、旧展示页与当前文档冲突，以以下顺序为准：

```text
docs/architecture.md
docs/scope/v0.1.md
docs/spec/v0.1-architecture.md
docs/architecture/*.md
docs/research/*
docs/development-log/*
```

研究材料和开发日志可以保留历史错误，它们不是当前实现要求。

## 文档规则

- 顶级架构和版本实现文档必须分离。
- 不允许把 `architecture.md` 缩成 v0.1 的实现范围。
- scope 改变时先改 `docs/scope/`。
- 实现细节改变时改 `docs/spec/`。
- 模块职责、层级结构、核心边界改变前，必须先和项目 owner grill/确认。
- ADR 只记录难逆、重要、且存在真实取舍的决策。
- 不创建新的顶级文档目录，除非现有目录无法容纳。

## 给 AI Agent 的最低要求

AI Agent 在实现前必须明确：

```text
当前任务属于哪个模块？
该模块在架构中为什么存在？
该模块不能做什么？
v0.1 是否包含该任务？
如何测试？
是否会影响架构边界？
```
