# OpenCamille

## Project Info

- **Runtime**: Node.js (TypeScript, ESM)
- **Package Manager**: pnpm (^11.8.0)
- **Language**: TypeScript 6.x, strict mode
- **Target**: ES2022, NodeNext module resolution
- **Dependencies**: zod, dotenv, tsx, @types/node

## Commands

All package management commands **must** use `pnpm`:

```bash
pnpm install          # Install dependencies
pnpm add <pkg>        # Add a dependency
pnpm add -D <pkg>     # Add a dev dependency
pnpm run <script>     # Run a script
pnpm test             # Run tests
```

To run TypeScript files directly:

```bash
pnpm tsx src/index.ts
```

## Code Style

- Strict TypeScript (`strict`, `noImplicitAny`, `strictNullChecks`)
- ESM modules (`"type": "module"`)
- Use `zod` for runtime validation
- Source in `src/`, output in `dist/`

## Karpathy Guidelines

Behavioral rules to reduce LLM coding mistakes. **Tradeoff:** biases toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove only imports/variables/functions that YOUR changes made unused.

The test: Every changed line should trace directly to the request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Strong success criteria enable independent loops. Weak criteria require constant clarification.

## Development Rules

### Git

**Claude 只建议，不执行。** 所有 git 操作（`git add`、`git commit`、`git push`、`git branch`、`git merge`、`git rebase` 等）由开发者手动执行。

- 指出需要执行哪些 git 命令，给出完整命令，但不运行它们
- 说明为什么需要这些命令（commit 了什么、为什么是这个顺序）
- GitHub 相关操作（`gh` CLI）同样遵循此规则
- 例外：`git status`、`git log`、`git diff` 等只读命令不受限制
