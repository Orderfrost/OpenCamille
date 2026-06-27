# AI Development Guide

Read this before using Codex, Claude Code, or another AI agent to modify
OpenCamille.

## Project Priority

OpenCamille is an Agent Harness. Do not collapse it into a single vertical
assistant or a Claude Code clone.

The current source of truth for scope is [v0.1 Scope](./scope/v0.1.md).

## Required Reading Order

Before implementation work:

1. [v0.1 Scope](./scope/v0.1.md)
2. [Architecture](./architecture.md)
3. [Architecture Verification](./research/architecture-verification.md)
4. The specific module document under `docs/architecture/` for the code being
   changed.

Before changing documentation:

1. [Docs README](./README.md)
2. The document being edited.
3. Any linked ADR or research file that the document depends on.

## Working Rules

- Use `pnpm` for all package commands.
- Keep TypeScript strict.
- Use `zod` at trust boundaries.
- Prefer the smallest implementation that satisfies the current scope.
- Do not add new dependencies unless the standard library or existing
  dependencies are clearly insufficient.
- Do not add speculative extension points.
- Do not refactor unrelated code.
- Do not run git write operations. Only suggest `git add`, `git commit`, or
  other git commands for the human developer to run.

## Architecture Rules

- The harness owns runtime infrastructure; an agent is one configured runtime
  entity inside the harness.
- Keep provider-specific details behind `ProviderAdapter`.
- Keep tool validation at the tool boundary.
- Permission checks happen before side-effecting tool execution.
- Trace important runtime decisions before optimizing UI or developer
  experience.
- MCP, plugins, skills, memory, and provider abstraction are core framework
  capabilities, but v0.1 implements only their smallest working slices.

## Documentation Rules

- `docs/README.md` is the index.
- `docs/scope/` defines version boundaries and priorities.
- `docs/architecture.md` explains accepted architecture.
- `docs/architecture/` contains module-level design.
- `docs/research/` contains evidence and investigation, not automatically
  accepted requirements.
- `docs/adr/` records hard-to-reverse decisions.

When a design changes, update scope first if the boundary changed, then update
architecture docs, then add an ADR only if the decision needs one.

## Definition Of Done

A change is done only when:

- It maps to the current scope or an explicit user request.
- Relevant tests or checks were run.
- Docs were updated if behavior, architecture, or scope changed.
- Any skipped work is named explicitly.

