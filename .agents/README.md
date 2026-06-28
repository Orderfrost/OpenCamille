# Project Main Agents

This directory contains project-scoped guidance for main Codex sessions.

It is not a Codex subagent directory and not a skill directory.

Use it by explicitly asking a session to read one agent file, for example:

```text
Read .agents/coding-agent.md and follow it for this session.
```

## Agents

- `coding-agent.md` - development workflow for implementation tasks.

## Boundaries

- Keep universal project rules in `AGENTS.md`.
- Keep concrete architecture, module, and version details in `docs/`.
- Keep spawned subagent definitions in `.codex/agents/`.
- Keep reusable Codex skills in `.agents/skills/` only if the project later chooses to use skills.
