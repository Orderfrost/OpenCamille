# OpenCamille Docs

This directory is the source of truth for OpenCamille development, architecture,
research, and demo material. Keep it organized enough to be read by humans and
AI coding agents before implementation.

## Start Here

1. [Architecture](./architecture.md) - complete top-level harness architecture.
2. [v0.1 Scope](./scope/v0.1.md) - current product and engineering boundary.
3. [v0.1 Architecture Spec](./spec/v0.1-architecture.md) - current
   implementation target for the first working harness slice.
4. [AI Development Guide](./ai-development-guide.md) - rules every AI developer
   must read before changing code or docs.
5. [Architecture Verification](./research/architecture-verification.md) -
   gaps and corrections found during architecture review.

## Directory Map

| Path | Purpose |
| --- | --- |
| `architecture.md` | Complete top-level architecture. This is the long-term target, not a per-version implementation slice. |
| `architecture/` | Top-level module/layer architecture notes. These should stay aligned with `architecture.md`. |
| `scope/` | Version scope: goals, priorities, out-of-scope items, success criteria. Scope says what a version includes. |
| `spec/` | Versioned implementation specs. Specs translate scope into buildable details for one development step. |
| `development-log/` | Daily development and architecture review logs. |
| `adr/` | Architecture decision records. |
| `research/` | Comparative research and validation material. |
| `architecture-front/` | Static presentation/demo interface for architecture display. |
| `architecture-diagram.html` | Standalone architecture diagram/demo page. |

## Documentation Rules

- If historical logs, research notes, or demo pages conflict with
  `architecture.md`, `scope/`, or `spec/`, treat the accepted architecture and
  versioned scope/spec as authoritative.
- Keep top-level architecture and version implementation docs separate.
- Do not shrink `architecture.md` to match a single version. If v0.1 implements
  only part of the system, document that in `scope/` and `spec/`.
- Update `scope/` when project boundaries or priorities change.
- Update `spec/` when a version's implementation target changes.
- Update architecture docs when module responsibilities, data flow, or runtime
  behavior changes.
- Do not change module boundaries, layer structure, or core architecture
  responsibilities without a prior grill/discussion with the project owner.
- Add an ADR only for decisions that are hard to reverse, surprising without
  context, and caused by a real trade-off.
- Keep research material separate from accepted architecture. Research supports
  decisions; it is not automatically a product requirement.
- Do not create new top-level doc categories unless an existing directory cannot
  hold the content.
