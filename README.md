# OpenCamille

A personal AI agent built with TypeScript.

## Prerequisites

- **Node.js** >= 22
- **pnpm** >= 11.8.0

## Quick Start

```bash
pnpm install        # Install dependencies
cp .env.example .env  # Create your env file and fill in the keys
pnpm dev            # Run in development mode
```

## Scripts

| Command          | Description                  |
| ---------------- | ---------------------------- |
| `pnpm dev`       | Run with hot-reload (tsx)    |
| `pnpm build`     | Compile TypeScript to `dist/` |
| `pnpm start`     | Run compiled output          |
| `pnpm typecheck` | Type-check without emitting  |
| `pnpm test`      | Run tests (vitest)           |
| `pnpm test:watch`| Run tests in watch mode      |
| `pnpm lint`      | Lint with Biome              |
| `pnpm format`    | Auto-fix lint & format issues|

## Project Structure

```
src/
├── index.ts        # Entry point
├── config.ts       # Env loading + validation (zod)
└── config.test.ts  # Tests for config
```
