# ADR 001: CLI Entry Point

**Date:** 2025-06-23
**Status:** Accepted

## Context

OpenCamille needs an interaction mode. Options considered:

| Option | Pros | Cons |
|--------|------|------|
| CLI tool | Simple, no UI work, focus on Agent core | No visual polish |
| Web chat | User-friendly, demo-friendly | Front-end dilutes Agent development |
| REST API | Extensible, can add UI later | Extra layer before Agent is built |

## Decision

**CLI tool.** The goal is to build a strong Agent core — prompt management, tool-calling loop, context handling. A CLI is the fastest path to a working, demonstrable system.

## Consequences

- `src/index.ts` will parse CLI arguments and output text results
- Can add API/Web frontend later without changing Agent core
- Demo requires terminal, not a browser
