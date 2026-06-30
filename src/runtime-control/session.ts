// RuntimeSession：Runtime Control 持有的 live Session 状态写入入口。
import type {
  ApprovalRequest,
  Checkpoint,
  Message,
  Session,
  SessionStatus,
  ToolCall,
} from "../types.js";

export type RuntimeSessionOptions = {
  sessionId: string;
  runId: string;
  maxTurns?: number;
  now?: () => string;
};

export class RuntimeSession {
  private readonly now: () => string;
  private state: Session;

  private constructor(state: Session, now: () => string) {
    this.state = state;
    this.now = now;
  }

  static create(options: RuntimeSessionOptions): RuntimeSession {
    return new RuntimeSession(
      {
        sessionId: options.sessionId,
        runId: options.runId,
        status: "idle",
        conversationHistory: [],
        budget: { maxTurns: options.maxTurns ?? 10, turnCount: 0 },
      },
      options.now ?? (() => new Date().toISOString()),
    );
  }

  appendUserMessage(content: string): Message {
    return this.appendMessage({ role: "user", content });
  }

  appendAssistantMessage(content: string, toolCalls?: ToolCall[]): Message {
    return this.appendMessage({ role: "assistant", content, toolCalls });
  }

  appendToolMessage(input: { toolCallId: string; content: string }): Message {
    return this.appendMessage({
      role: "tool",
      content: input.content,
      toolCallId: input.toolCallId,
    });
  }

  setStatus(status: SessionStatus): void {
    this.state = { ...this.state, status };
  }

  savePendingApproval(request: ApprovalRequest): void {
    this.state = {
      ...this.state,
      status: "waiting_approval",
      pendingApproval: request,
    };
  }

  approvePendingApproval(approvalId: string): ToolCall {
    const approval = this.expectPendingApproval(approvalId);
    this.clearPendingApproval();
    return approval.toolCall;
  }

  denyPendingApproval(approvalId: string): ApprovalRequest {
    const approval = this.expectPendingApproval(approvalId);
    this.clearPendingApproval();
    return approval;
  }

  snapshot(): Session {
    return structuredClone(this.state);
  }

  toCheckpoint(): Checkpoint {
    return {
      ...this.snapshot(),
      createdAt: this.now(),
    };
  }

  private appendMessage(input: Omit<Message, "id" | "createdAt">): Message {
    const message: Message = {
      id: crypto.randomUUID(),
      createdAt: this.now(),
      ...input,
    };
    this.state = {
      ...this.state,
      conversationHistory: [...this.state.conversationHistory, message],
    };
    return message;
  }

  private clearPendingApproval(): void {
    this.state = {
      ...this.state,
      status: "running",
      pendingApproval: undefined,
    };
  }

  private expectPendingApproval(approvalId: string): ApprovalRequest {
    if (!this.state.pendingApproval || this.state.pendingApproval.id !== approvalId) {
      throw new Error(`Pending approval not found: ${approvalId}`);
    }

    return this.state.pendingApproval;
  }
}
