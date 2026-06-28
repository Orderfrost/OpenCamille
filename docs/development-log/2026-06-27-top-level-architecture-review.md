# 2026-06-27 Top-Level Architecture Review

## Context

This review examines the complete top-level OpenCamille Agent Harness
architecture, not the v0.1 implementation slice. The goal is to identify
architecture risks that could block later development.

No architecture structure was changed during this review. Findings that affect
module boundaries, layer structure, or core responsibilities require a
follow-up grill session before edits.

## Comparison Baseline

The review compared the current architecture against:

- Claude Code: coding agent surface, hooks, skills, permissions, multi-agent
  behavior.
- GitHub Copilot cloud agent: task flow, background execution, PR/log
  transparency.
- LangGraph: durable execution, persistence, human-in-the-loop, agent
  orchestration.
- OpenHands: agent platform, sandboxing, frontend/server/backend separation.
- Existing project research: `docs/research/architecture-verification.md`.

## Summary

The architecture covers the right major components:

- Harness / Agent distinction
- Session
- Agent Loop
- Tool system
- Permission engine
- Provider adapter
- Memory
- Skill loading
- MCP
- Lifecycle hooks
- Trace store

The main weakness is not missing categories. The weakness is that several
categories are described as concepts but do not yet define the protocols that
make them implementable.

## High-Risk Findings

### 1. Layering Is Useful Conceptually But Weak As An Implementation Boundary

The architecture defines five layers:

1. Interface
2. Session
3. Agent
4. Service
5. Infrastructure

But it also allows cross-layer access from Agent to ProviderAdapter and
MemoryStore, Session to SessionStore, and unrestricted cross-cutting modules.

Risk:

- The project may pay the cost of strict layering without receiving clear
  dependency control.
- Implementation may drift into pass-through wrappers and unclear ownership.

Grill needed:

- Are the five layers intended as package boundaries, or only conceptual
  documentation boundaries?

### 2. Session State Machine Is Too Weak

Current Session state is:

```text
idle -> active -> paused -> ended
```

Human approval, user input, and plan approval are modeled as blocking calls
inside `active`.

Risk:

- Resume/replay becomes ambiguous.
- UI cannot accurately show why the agent is stopped.
- Permission approval and long-running tasks become hard to audit.
- Human-in-the-loop pauses become invisible to persistence.

Grill needed:

- Should `waiting_approval`, `waiting_user`, and plan review states become
  explicit Session states in the complete architecture?

### 3. Plan-Review-Execute Is Not A First-Class State Flow

The Agent layer has `plan-and-solve`, but Session has no planning states.

Risk:

- Plan approval becomes an Agent-internal implementation detail rather than a
  durable workflow.
- Replaying a plan review or resuming after plan approval is hard.

Grill needed:

- Is Plan-Review-Execute a core architecture primitive or only an Agent mode?

### 4. ToolDef Return Type Is Too Weak

Current tool execution returns a plain string.

Risk:

- Cannot reliably represent exit code, stderr, duration, timeout, truncation,
  structured errors, permission denial, or metadata.
- Hard to trace, replay, retry, and summarize tool outcomes.

Grill needed:

- Should all tools return a structured `ToolResult`?

### 5. Permission Model Lacks Execution Boundaries

Deny-first permission order is correct, but current docs do not define:

- workspace path boundary
- path normalization
- shell cwd
- timeout
- stdout/stderr truncation
- environment variable filtering
- network policy
- plugin/MCP tool trust level

Risk:

- Side-effecting tools become unsafe or inconsistent.
- Plugin and MCP tools bypass the same safety model as built-ins.

Grill needed:

- Should safety boundaries live inside PermissionEngine, ToolExecutor, or both?

### 6. TraceStore Observability Does Not Equal Replay

TraceStore is currently described as OpenTelemetry spans.

Risk:

- Spans are useful for observability but not sufficient for replay.
- Replay needs model requests, tool inputs/outputs, permission decisions,
  session states, cwd/env context, redaction, and errors.

Grill needed:

- Is Replay a first-class requirement of the complete architecture, or only a
  v0.1 implementation requirement?

### 7. ProviderAdapter Needs Canonical Runtime Schemas

ProviderAdapter is described as translating `ContextAssembly` to provider API
formats, but canonical runtime shapes are not defined.

Risk:

- Anthropic/OpenAI differences leak into AgentLoop.
- Streaming tool calls, tool results, finish reasons, thinking/reasoning, and
  provider errors are handled inconsistently.

Grill needed:

- Should the complete architecture define canonical `Message`, `ToolCall`,
  `ToolResult`, and `StreamEvent` types?

## Medium-Risk Findings

### 8. Lifecycle Merges Too Many Concepts

Lifecycle tries to unify InterceptorChain, Hook, and EventBus.

Risk:

- Handler ordering, async errors, mutation conflict, timeout, and isolation
  rules are unclear.
- A global lifecycle system could become an overpowered abstraction.

Grill needed:

- Should before/after lifecycle callbacks replace InterceptorChain and EventBus,
  or should these concepts remain separate?

### 9. Memory Has Tiers But Not Governance

The three-tier memory model is strong, but persistent memory lacks rules for:

- what can be written
- who approves writes
- how updates happen
- how deletes happen
- how wrong memories are corrected
- how failure memories are stored

Risk:

- Persistent memory can become polluted and reduce agent reliability.

Grill needed:

- Should memory writes be explicit/user-approved by default?

### 10. Agent Swap And Skill Switch Are Blurred

The architecture says Session can swap Agent, and also says Agent switching is
Skill switching.

Risk:

- Agent identity, capability injection, toolset changes, and runtime state
  become hard to reason about.

Grill needed:

- Are Agent Swap and Skill Switch separate concepts?

### 11. Sub-Agent Protocol Is Under-Specified

Hub-and-Spoke direction is reasonable, but missing:

- task input schema
- result schema
- summary format
- failure propagation
- permission inheritance details
- trace merging

Risk:

- Multi-agent feature may be hard to integrate cleanly later.

Grill needed:

- Should sub-agent execution be modeled as a special tool call with structured
  input/output?

### 12. Multi-Interface Needs A Shared Session Protocol

The Interface layer includes CLI, Web, TUI, and multi-interface subscription.

Risk:

- Each interface may develop its own session semantics unless there is a shared
  protocol for inputs, outputs, approvals, and state updates.

Grill needed:

- Should Interface talk to Session directly or through a stable SessionHandle
  protocol?

## Low-Risk Findings

### 13. Tool List Is Inconsistent

The Service doc says initial tools are four, but lists five:

- read_file
- write_file
- shell_exec
- agent_task
- Todo

It also lacks common coding tools such as search/list/edit.

### 14. Storage Path Naming Is Inconsistent

The docs use both:

- `~/.opencamille`
- `~/.camille`

### 15. Error Handling Is Too Model-Driven

The architecture says raw errors are passed to the model and the model decides
retry/alternative/report.

Risk:

- Harness-level errors are not classified enough for retry, trace, or user
  reporting.

### 16. Verification Is Not A First-Class Outcome

The architecture includes shell execution and loop guards, but does not model
verification outcomes as first-class events.

Risk:

- Coding tasks may produce changes without clear pass/fail validation records.

## Recommended Grill Order

1. Layering: package boundary or conceptual model?
2. Session state machine and human-in-the-loop states.
3. Plan-Review-Execute as core primitive or Agent mode.
4. ToolResult and ToolExecutor safety model.
5. Trace/replay requirements.
6. Provider-neutral runtime schemas.
7. Lifecycle vs Interceptor/EventBus separation.
8. Memory governance.
9. Agent Swap vs Skill Switch.
10. Sub-agent protocol.
11. Multi-interface protocol.
12. Low-risk cleanup items.

