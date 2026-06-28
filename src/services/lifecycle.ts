// 生命周期服务：定义 v0.1 RunEvent 名称，并提供进程内 EventBus。
import type { RunEvent } from "../types.js";

export const RUN_EVENT_TYPES = {
  sessionCreated: "session_created",
  sessionResumed: "session_resumed",
  sessionClosed: "session_closed",
  runStarted: "run_started",
  turnStarted: "turn_started",
  contextBuilt: "context_built",
  contextOverflow: "context_overflow",
  modelStarted: "model_started",
  modelDelta: "model_delta",
  modelFinished: "model_finished",
  modelFailed: "model_failed",
  toolRequested: "tool_requested",
  approvalRequested: "approval_requested",
  approvalResolved: "approval_resolved",
  toolStarted: "tool_started",
  toolFinished: "tool_finished",
  toolFailed: "tool_failed",
  toolDenied: "tool_denied",
  compactionStarted: "compaction_started",
  compactionFinished: "compaction_finished",
  compactionFailed: "compaction_failed",
  checkpointStarted: "checkpoint_started",
  checkpointFinished: "checkpoint_finished",
  checkpointFailed: "checkpoint_failed",
  turnFinished: "turn_finished",
  turnFailed: "turn_failed",
  runFinished: "run_finished",
  runFailed: "run_failed",
  runCancelled: "run_cancelled",
} as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[keyof typeof RUN_EVENT_TYPES];

export type EventListener = (event: RunEvent) => void | Promise<void>;

export type EventBus = {
  emit(event: RunEvent): Promise<void>;
  subscribe(listener: EventListener): () => void;
};

export function createEventBus(): EventBus {
  const listeners = new Set<EventListener>();

  return {
    // 一个 listener 失败不能阻止其他 listener 收到事件；错误在全部通知后统一抛出。
    async emit(event) {
      const errors: unknown[] = [];

      for (const listener of listeners) {
        try {
          await listener(event);
        } catch (error) {
          errors.push(error);
        }
      }

      if (errors.length > 0) {
        throw new AggregateError(errors, "One or more EventBus listeners failed");
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
