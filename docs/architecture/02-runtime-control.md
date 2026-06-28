# Layer 2: Runtime Control

Runtime Control owns live session state and coordinates execution.

Responsibilities:

```text
- create/resume/close Session
- own ConversationHistory
- own status, pendingApproval, and budget fields
- route Commands
- call AgentLoop for each turn
- pause and resume approval-required tool calls
- rehydrate live Session from Recorder checkpoint
```

Rules:

```text
Runtime Control is the only writer of live ConversationHistory.
Agent Runtime returns results, not state mutations.
Recorder records/checkpoints, not live state.
```

v0.1 implementation should keep state in one `Session` object instead of
splitting `RunState`, `ApprovalState`, and `BudgetState` classes.
