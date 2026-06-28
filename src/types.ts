// v0.1 运行时公共类型：各层通过这些类型共享 Session、工具、事件和记录契约。
import type { ZodType } from "zod";

export type SessionStatus =
  | "idle"
  | "running"
  | "waiting_approval"
  | "paused"
  | "finished"
  | "failed"
  | "cancelled";

export type MessageRole = "user" | "assistant" | "tool" | "system";

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  createdAt: string;
};

export type Session = {
  sessionId: string;
  runId: string;
  status: SessionStatus;
  conversationHistory: Message[];
  pendingApproval?: ApprovalRequest;
  budget: {
    maxTurns: number;
    turnCount: number;
  };
  sessionSummary?: string;
};

export type ContextAssembly = {
  system: string;
  tools: ToolDefinition[];
  messages: Message[];
};

export type ProviderStreamItem =
  | { type: "model_delta"; text: string }
  | { type: "tool_use"; toolCall: ToolCall }
  | { type: "final_message"; message: Message }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "error"; error: string };

// inputSchema 使用 zod 类型，保证工具输入在执行前能做 runtime validation。
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ZodType<unknown>;
  category: "safe" | "write" | "dangerous";
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ToolResult =
  | {
      status: "ok";
      toolCallId: string;
      content: string;
      recordContent?: string;
      truncated: boolean;
    }
  | {
      status: "error";
      toolCallId: string;
      error: string;
    }
  | {
      status: "approval_required";
      request: ApprovalRequest;
    };

export type PermissionDecision = "allow" | "ask" | "deny";

export type ApprovalRequest = {
  id: string;
  toolCall: ToolCall;
  reason: string;
  createdAt: string;
};

export type RunEvent = {
  id: string;
  runId: string;
  sessionId: string;
  turnId?: string;
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

export type TranscriptItem = {
  id: string;
  runId: string;
  sessionId: string;
  turnId?: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

// Checkpoint 是 resume 的唯一状态来源，不能用 events replay 重建 live Session。
export type Checkpoint = {
  runId: string;
  sessionId: string;
  status: SessionStatus;
  conversationHistory: Message[];
  pendingApproval?: ApprovalRequest;
  budget: Session["budget"];
  sessionSummary?: string;
  createdAt: string;
};
