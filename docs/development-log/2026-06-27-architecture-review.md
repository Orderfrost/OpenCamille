# 2026-06-27 Architecture Review Log

## Context

OpenCamille has a Claude Code-grilled Agent Harness architecture, but formal
development has not started. The review focused on whether the architecture is
complete, reasonable, clear enough to implement, and suitable as a job-search
project.

## Summary

The project direction is valid and suitable for a strong job-search project:
build a transparent, controllable, extensible TypeScript Agent Harness rather
than a Claude Code or Codex clone.

The current risk is not lack of ambition. The risk is that scope, architecture,
and research findings are not yet reconciled into one executable v0.1 design.

## High-Priority Findings

1. The architecture still describes a strict five-layer model, while the
   verification report recommends a simpler three-surface model. The five-layer
   model creates ceremony but the current cross-layer exceptions weaken its
   value.

2. The Session state machine is under-specified. Human approval, user input, and
   plan review are modeled as blocking calls while the Session stays `active`.
   This will make resume, trace, replay, UI state, and permission handling
   harder.

3. v0.1 scope lists MCP, plugins, skills, memory, and provider abstraction as
   high-priority framework capabilities, but the architecture describes closer
   to full ecosystem versions. Each capability needs a minimal v0.1 protocol.

4. TraceStore is described as OpenTelemetry-style spans, but v0.1 requires
   replayable JSONL. Spans are useful later; replay needs runtime inputs,
   decisions, outputs, and error context.

5. Tool execution lacks a concrete safety model. File writes, shell execution,
   MCP tools, and plugin tools need path, cwd, timeout, output, environment, and
   approval boundaries.

6. ProviderAdapter is too abstract. The internal message, tool call, tool
   result, and stream event schema must be fixed before implementation.

7. MemoryStore includes CompactionAgent details that are too heavy for v0.1, but
   the long-term memory write/update/delete rules are not clear enough.

8. ADR coverage is weak. `docs/adr/001-use-cli.md` is still a placeholder while
   several meaningful architecture decisions already exist.

## Development Difficulty

Difficulty is medium-high. The hard parts are not algorithms; they are runtime
boundaries:

- streaming and async control flow
- provider-neutral tool calling
- permission and safety boundaries
- trace and replay correctness
- plugin/MCP/skill loading without overbuilding
- testing fake providers and fake tools

## Time Estimate

Assuming focused solo development:

- Core loop, tools, permissions, one provider: 3-4 weeks.
- Trace/replay, minimal skill, minimal plugin, minimal MCP, minimal memory:
  8-12 weeks total.
- Documentation, demo, tests, and presentation polish: 2-3 more weeks.

Multi-agent orchestration, Web UI, and full plugin ecosystem should stay outside
the critical v0.1 path.

## Job-Search Assessment

The project is suitable for job search if presented as:

> A from-scratch TypeScript Agent Harness focused on runtime, tools,
> permissions, trace/replay, plugin capability, and safe extensibility.

It should not be presented as:

> A better Claude Code.

## Follow-Up Action

Create a focused v0.1 architecture spec that resolves the high-priority gaps:

- three-surface runtime model
- explicit Session state machine
- internal runtime schemas
- tool safety model
- replayable trace format
- minimal plugin/skill/MCP/memory protocols

