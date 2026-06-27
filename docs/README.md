# OpenCamille Docs

This directory is the source of truth for OpenCamille development, architecture,
research, and demo material. Keep it organized enough to be read by humans and
AI coding agents before implementation.

## Start Here

1. [v0.1 Scope](./scope/v0.1.md) - current product and engineering boundary.
2. [AI Development Guide](./ai-development-guide.md) - rules every AI developer
   must read before changing code or docs.
3. [Architecture](./architecture.md) - top-level harness architecture.
4. [Architecture Verification](./research/architecture-verification.md) -
   gaps and corrections found during architecture review.

## Directory Map

| Path | Purpose |
| --- | --- |
| `scope/` | Version scope: goals, priorities, out-of-scope items, success criteria. |
| `architecture.md` | Current top-level architecture document. |
| `architecture/` | Layer/module-specific architecture notes. |
| `adr/` | Architecture decision records. |
| `research/` | Comparative research and validation material. |
| `architecture-front/` | Static presentation/demo interface for architecture display. |
| `architecture-diagram.html` | Standalone architecture diagram/demo page. |

## Documentation Rules

- Update `scope/` when project boundaries or priorities change.
- Update architecture docs when module responsibilities, data flow, or runtime
  behavior changes.
- Add an ADR only for decisions that are hard to reverse, surprising without
  context, and caused by a real trade-off.
- Keep research material separate from accepted architecture. Research supports
  decisions; it is not automatically a product requirement.
- Do not create new top-level doc categories unless an existing directory cannot
  hold the content.

