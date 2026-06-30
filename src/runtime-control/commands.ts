// CommandDispatcher：把 surface command 路由到 RuntimeSession，暂不调用 AgentLoop。
import type { Message } from "../types.js";
import type { RuntimeSession } from "./session.js";

export type RuntimeCommand = {
  type: "user_message";
  content: string;
};

export class CommandDispatcher {
  constructor(private readonly session: RuntimeSession) {}

  dispatch(command: RuntimeCommand): Message {
    switch (command.type) {
      case "user_message":
        return this.session.appendUserMessage(command.content);
    }
  }
}
