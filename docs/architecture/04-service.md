# Layer 4: Service

> OpenCamille 架构 · 第 4 层

## 职责

工具管理与执行、权限控制、外部工具接入。

## 模块

```
Service 层:

  ToolRegistry
    ├── read_file, write_file, shell_exec
    ├── agent_task (spawn 子 Agent)
    ├── Todo (plan-and-solve 子目标管理)
    └── MCP:* (通过 MCPToolAdapter 接入)

  PermissionEngine (Deny-first)
    ├── deny → ask → allow（顺序匹配）
    ├── 三级: safe(allow) / write(ask) / dangerous(deny)
    └── Session 记忆用户选择

  InterceptorChain
    ├── LoopGuard check → Permission check → execute
    └── 同步阻断链
```

## ToolDef

```typescript
ToolDef {
  name: string            ← 工具名
  description: string     ← LLM 可见的描述
  inputSchema: ZodType    ← zod schema → TS 类型 + LLM JSON Schema + 运行时校验
  execute(params) → string ← 执行，返回纯字符串结果
}
```

一份 zod 三用：编译时类型、运行时校验、LLM Schema 生成。

## 工具分类（初 4 个）

| 工具 | 功能 |
|------|------|
| read_file | 读取文件内容 |
| write_file | 写入文件 |
| shell_exec | 执行 shell 命令 |
| agent_task | spawn 子 Agent |
| Todo | plan-and-solve 子目标管理 |

## 权限引擎

```
评估: deny rules → ask rules → allow rules
      deny 永远覆盖 allow

工具分类默认行为:
  safe:      allow（read_file, search）
  write:     ask（write_file, edit）—— 首次后 session 记忆
  dangerous: deny（shell_exec, delete, http_post）—— 用户显式 allow
```

## 依赖

↓ Infrastructure

## 参考

- Claude Code: deny-first 权限, structured tools
- Codex: shell-centric 工具哲学, minimal tool set
