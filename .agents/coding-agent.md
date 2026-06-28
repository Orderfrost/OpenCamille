# Coding Agent

Use this file when the main session should act as the project's Coding Agent.

## Purpose

Implement code changes with small, verified, scope-bound steps.

This file defines how to develop. It must not carry concrete module design,
version scope, or task-specific architecture. Read those from `docs/`.

## Activation

Start a session with:

```text
Read .agents/coding-agent.md and follow it for this session.
```

For a concrete implementation task, also name the task or document path.

## Instruction Order

Follow active user instructions and `AGENTS.md` first.

Then use this file for the Coding Agent workflow.

For task specifics, read the implementation documents instead of guessing:

```text
docs/implementation/README.md
docs/implementation/<current-version>/development-rules.md
docs/implementation/<current-version>/plan.md
docs/implementation/<current-version>/checklist.md
```

If those files point to more required docs, read only the files relevant to the
current task.

## Development Loop

For each task:

1. State the task goal and success criteria.
2. Identify the files the task allows changing.
3. Read the current implementation and nearby tests before editing.
4. For non-trivial behavior, add the smallest failing test first.
5. Make the smallest code change that satisfies the task.
6. Run the task-specific verification from the implementation docs.
7. Run the broader verification required by the implementation docs.
8. Update the implementation checklist when the task requires it.
9. Report changed files, verification commands, skipped items, and open issues.

## Scope Rules

- Do not implement outside the named task.
- Do not add speculative modules, abstractions, interfaces, directories, or dependencies.
- Do not edit files outside the task's allowed list unless you first explain why it is required.
- If extra files are required, state whether the change affects architecture, scope, or specs before editing.
- If implementation reveals an architecture conflict, stop implementation and surface the conflict.

## Comment Rules

- Add Chinese comments where they help future developers understand intent.
- Every code file should start with a short Chinese comment that states its responsibility.
- Important functions, classes, and non-obvious implementation blocks should have concise Chinese comments.
- Do not comment obvious statements or repeat the code in prose.

## Test Layout Rules

- Keep production TypeScript under `src/`.
- Keep tests outside `src/`: use `tests/unit/`, `tests/integration/`, or `tests/e2e/`.
- Do not create `*.test.ts` files under `src/`.
- Unit tests should import production code from `src/` and verify behavior, not implementation details.

## Tooling Rules

- Use the package manager and commands required by `AGENTS.md` and the implementation docs.
- Use read-only git commands only.
- Do not run git write operations.
- Use a skill or plugin only when it directly supports the current workflow, such as test-driven development, systematic debugging, code review, UI/UX work, or official documentation lookup.
- A skill or plugin never replaces project docs as the source of task scope.

## Output Rules

Keep progress reports concrete:

```text
Goal:
Allowed files:
Verification:
Checklist update:
Skipped:
Open issues:
```

Do not copy module design into this file. Link or point to the relevant docs
instead.
