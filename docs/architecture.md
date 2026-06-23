# OpenCamille Architecture

> Version: 0.1.0-draft | Date: 2025-06-23
>
> This document records all architectural decisions made during the initial
> design phase. Each decision is grounded in a comparative study of Claude Code,
> Codex, OpenClaw, and OpenCode. See `docs/research/` for the full study.

---

## 1. System Overview

```
User (CLI)
    │
    ▼
┌─────────────────────────────────────────────┐
│              PromptManager                    │
│  L1: Base system prompt                      │
│  L2: Dynamic context (tools, date, rules)    │
│  L3: Memory (persistent + compressed + live) │
│       ↓                                      │
│  PromptAssembly { system, tools, messages }  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              Agent Loop (ReAct)              │
│                                              │
│  while not done:                             │
│    ┌──────────────────────────────────────┐ │
│    │  Think (streamed to user)             │ │
│    │  → Model returns text or tool_calls   │ │
│    ├──────────────────────────────────────┤ │
│    │  if tool_calls:                       │ │
│    │    Act (Promise.all within same turn) │ │
│    │    → Permission.check(tool, params)   │ │
│    │    → Execute tool                     │ │
│    │    → Observe (result → messages)      │ │
│    ├──────────────────────────────────────┤ │
│    │  if stop: return final text           │ │
│    └──────────────────────────────────────┘ │
│                                              │
│  Guard: max_turns=50, soft warning at 40     │
└──────────────────┬──────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│ Tool   │  │Permission│  │ Memory   │
│ Registry│  │ Engine   │  │ Store    │
└────────┘  └──────────┘  └──────────┘
```

---

## 2. Module Design

### 2.1 Agent Loop (ReAct)

- **Primary pattern**: ReAct (`Think → Act → Observe → repeat`)
- **Optional injection points**: Plan-Execute (complex tasks), Multi-Attempt Retry (non-deterministic ops)
- **Thinking**: start with prompt-based reasoning (provider-agnostic), add Anthropic `thinking` param later as a provider-specific optimization
- **Termination**: `finish_reason === "stop"` + max_turns=50 with soft warning injected at turn 40
- **Tool execution**: `Promise.all` for tool calls within the same turn (model's parallel intent), serial across turns (model needs prior results)
- **Error handling**: raw error messages passed to model; model decides retry/alternative/report

### 2.2 PromptManager

- **Output**: `PromptAssembly { system: string, tools: ToolDef[], messages: Message[] }` — provider-agnostic struct
- **Assembly**: append-only across 3 layers (L1 → L2 → L3), no layer can override prior layers
- **L1** — Base system prompt: agent identity, behavior rules, output format
- **L2** — Dynamic context: tool list, working directory, date/time, permission rules — refreshed every turn
- **L3** — Memory context: persistent memories + compressed summary + current conversation window

### 2.3 Provider Adapter

- **Interface**: translates `PromptAssembly` → provider-specific request format
- **AnthropicAdapter**: system param, tool_use blocks, tool_result user messages
- **OpenAIAdapter**: system message, function calls, role:"tool" messages
- **Implementation order**: Anthropic first (bare SDK), extract interface, add OpenAI

### 2.4 Tool System

- **Definition**: custom `ToolDef { name, description, inputSchema: z.ZodType }`
  - One zod schema → TS type + runtime validation + LLM JSON Schema (via adapter)
- **Initial tools**: `read_file`, `write_file`, `shell_exec`
- **Registry**: static map, tools added by configuration, not code change

### 2.5 Permission Engine (Deny-First)

- **Evaluation order**: deny → ask → allow (first match wins; deny always overrides allow)
- **Tool categories**:

| Level | Default | Examples |
|-------|---------|----------|
| safe | allow | read_file, list_dir, search |
| write | ask | write_file, edit, move |
| dangerous | deny | shell_exec, http_post, delete |

- **Session memory**: user approvals remembered within session scope; optional persist to `~/.opencamille/permissions.json`
- **New tools**: assigned a category, inherit category behavior automatically

### 2.6 Memory System (3-Tier)

| Tier | Content | Lifetime | Storage |
|------|---------|----------|---------|
| Working | Full message history + reasoning chain + tool results | Current session | In-memory |
| Compressed | Summarized early messages (hysteresis: protect 40K tokens, prune when 20K+ freed) | Current session | In-memory |
| Persistent | User preferences, decisions, facts | Cross-session | `~/.opencamille/memory/*.md` |

- **Compaction trigger**: OpenCode-style dual threshold — PRUNE_PROTECT=40K (recent window preserved), PRUNE_MINIMUM=20K (minimum reclaim to trigger)
- **Persistent format**: one Markdown file per fact, frontmatter metadata, human-readable, git-friendly

### 2.7 Streaming

- **Mixed mode**: text content streamed to user in real-time; tool call parameters buffered, executed only after complete call is received
- **Rationale**: thinking visibility without partial-JSON complexity

---

## 3. Decisions Not Yet Made

- [ ] Concrete tool list beyond the initial 3
- [ ] Persistent memory: frontmatter schema and file naming convention
- [ ] Compression agent: separate model call vs. rule-based summarization
- [ ] Multi-agent orchestration (hub-and-spoke vs. plugin SDK model)
- [ ] Plugin/hook system for external extensions
- [ ] Terminal UI: raw stdout vs. structured output (spinners, panels)

---

## 4. ADR Index

| ADR | Decision | Status |
|-----|----------|--------|
| 001 | CLI entry point | Draft |
| 002 | Deny-first permission system | Draft |
| 003 | Three-layer memory (working + compressed + persistent) | Draft |
| 004 | PromptManager + Provider Adapter separation | Draft |
| 005 | Structured tool system with custom ToolDef (zod-based) | Draft |
| 006 | ReAct loop with composable primitives | Draft |
| 007 | Mixed streaming (text streamed, tool calls buffered) | Draft |
| 008 | Loop termination: max_turns + soft warning | Draft |
| 009 | Provider: Anthropic-first, adapter for multi-provider | Draft |
| 010 | Tool execution: parallel within turn, serial across turns | Draft |
