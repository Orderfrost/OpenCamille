// ProviderAdapter：按协议把 OpenAI / Anthropic 兼容 SSE streaming 映射为厂商无关事件。
import { toJSONSchema } from "zod";
import type { Config } from "../config.js";
import type {
  ContextAssembly,
  Message,
  ProviderStreamItem,
  ToolCall,
  ToolDefinition,
} from "../types.js";

type Fetch = typeof fetch;
type ProviderEvent = Record<string, unknown>;

export type ProviderAdapter = {
  stream(context: ContextAssembly): AsyncIterable<ProviderStreamItem>;
};

export type ProviderOptions = {
  fetch?: Fetch;
};

export function createProviderAdapter(
  config: Config,
  options: ProviderOptions = {},
): ProviderAdapter {
  return new ProviderAdapterFactory(options.fetch ?? fetch).create(config);
}

// ProviderAdapterFactory：唯一负责把配置里的协议名绑定到具体协议适配器。
class ProviderAdapterFactory {
  constructor(private readonly fetchImpl: Fetch) {}

  create(config: Config): ProviderAdapter {
    if (config.provider.protocol === "openai-responses") {
      return new OpenAiResponsesProviderAdapter(config, this.fetchImpl);
    }

    if (config.provider.protocol === "openai-chat-completions") {
      return new OpenAiChatCompletionsProviderAdapter(config, this.fetchImpl);
    }

    return new AnthropicMessagesProviderAdapter(config, this.fetchImpl);
  }
}

// OpenAiResponsesProviderAdapter：对接 OpenAI Responses API，适合 OpenAI 原生 agent/tool 流式事件。
class OpenAiResponsesProviderAdapter implements ProviderAdapter {
  private readonly apiKey: string;

  constructor(
    private readonly config: Config,
    private readonly fetchImpl: Fetch,
  ) {
    if (!config.provider.apiKey) {
      throw new Error(`apiKey is required for provider ${config.provider.name}`);
    }
    this.apiKey = config.provider.apiKey;
  }

  async *stream(context: ContextAssembly): AsyncIterable<ProviderStreamItem> {
    const response = await this.fetchImpl(joinUrl(this.config.provider.baseUrl, "responses"), {
      method: "POST",
      headers: {
        ...this.config.provider.headers,
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...optionalHeaders({
          "openai-organization": this.config.provider.organization,
          "openai-project": this.config.provider.project,
        }),
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        input: toOpenAiMessages(context),
        instructions: context.system,
        max_output_tokens: this.config.runtime.maxOutputTokens,
        ...openAiResponsesRuntimeOptions(this.config),
        tools: context.tools.map(toOpenAiResponsesTool),
        stream: true,
      }),
    });

    assertOkResponse(response);

    let text = "";
    for await (const event of readSse(response)) {
      if (event === "[DONE]") {
        continue;
      }

      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        text += event.delta;
        yield { type: "model_delta", text: event.delta };
      }

      const toolCall = readOpenAiToolCall(event);
      if (toolCall) {
        yield { type: "tool_use", toolCall };
      }

      if (event.type === "response.completed") {
        yield finalMessage(text);
        const usage = readOpenAiUsage(event);
        if (usage) {
          yield usage;
        }
      }
    }
  }
}

// OpenAiChatCompletionsProviderAdapter：对接 OpenAI Chat Completions 兼容接口，供 DeepSeek/GLM 等 profile 复用。
class OpenAiChatCompletionsProviderAdapter implements ProviderAdapter {
  private readonly apiKey: string;

  constructor(
    private readonly config: Config,
    private readonly fetchImpl: Fetch,
  ) {
    if (!config.provider.apiKey) {
      throw new Error(`apiKey is required for provider ${config.provider.name}`);
    }
    this.apiKey = config.provider.apiKey;
  }

  async *stream(context: ContextAssembly): AsyncIterable<ProviderStreamItem> {
    const response = await this.fetchImpl(
      joinUrl(this.config.provider.baseUrl, "chat/completions"),
      {
        method: "POST",
        headers: {
          ...this.config.provider.headers,
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          ...optionalHeaders({
            "openai-organization": this.config.provider.organization,
            "openai-project": this.config.provider.project,
          }),
        },
        body: JSON.stringify({
          model: this.config.provider.model,
          messages: toOpenAiMessages(context),
          max_tokens: this.config.runtime.maxOutputTokens,
          ...openAiChatRuntimeOptions(this.config),
          tools: context.tools.map(toOpenAiChatTool),
          stream: true,
        }),
      },
    );

    assertOkResponse(response);

    let text = "";
    const toolCalls = new Map<number, { id: string; name: string; json: string }>();
    let finalYielded = false;

    for await (const event of readSse(response)) {
      if (event === "[DONE]") {
        if (!finalYielded) {
          yield finalMessage(text);
        }
        continue;
      }

      const deltaText = readOpenAiChatDeltaText(event);
      if (deltaText) {
        text += deltaText;
        yield { type: "model_delta", text: deltaText };
      }

      collectOpenAiChatToolDelta(event, toolCalls);

      if (hasOpenAiChatFinishReason(event, "tool_calls")) {
        for (const toolCall of readOpenAiChatToolCalls(toolCalls)) {
          yield { type: "tool_use", toolCall };
        }
      }

      const usage = readOpenAiChatUsage(event);
      if (usage) {
        yield usage;
      }

      if (hasOpenAiChatFinishReason(event)) {
        finalYielded = true;
        yield finalMessage(text);
      }
    }
  }
}

// AnthropicMessagesProviderAdapter：对接 Anthropic Messages API 以及 Anthropic-compatible endpoint。
class AnthropicMessagesProviderAdapter implements ProviderAdapter {
  private readonly apiKey: string;

  constructor(
    private readonly config: Config,
    private readonly fetchImpl: Fetch,
  ) {
    if (!config.provider.apiKey) {
      throw new Error(`apiKey is required for provider ${config.provider.name}`);
    }
    this.apiKey = config.provider.apiKey;
  }

  async *stream(context: ContextAssembly): AsyncIterable<ProviderStreamItem> {
    const response = await this.fetchImpl(joinUrl(this.config.provider.baseUrl, "messages"), {
      method: "POST",
      headers: {
        ...this.config.provider.headers,
        "anthropic-version": this.config.provider.version ?? "2023-06-01",
        ...optionalHeaders({ "anthropic-beta": this.config.provider.beta }),
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        system: context.system,
        messages: toAnthropicMessages(context),
        max_tokens: this.config.runtime.maxOutputTokens,
        ...anthropicRuntimeOptions(this.config),
        tools: context.tools.map(toAnthropicTool),
        stream: true,
      }),
    });

    assertOkResponse(response);

    let text = "";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();

    for await (const event of readSse(response)) {
      if (event === "[DONE]") {
        continue;
      }

      if (event.type === "message_start") {
        inputTokens = readNumber(event.message, "usage", "input_tokens");
        if (inputTokens !== undefined) {
          yield { type: "usage", inputTokens };
        }
      }

      const delta = asRecord(event.delta);
      if (event.type === "content_block_delta" && delta?.type === "text_delta") {
        const deltaText = String(delta.text ?? "");
        text += deltaText;
        yield { type: "model_delta", text: deltaText };
      }

      collectAnthropicToolDelta(event, toolBlocks);

      if (event.type === "content_block_stop" && typeof event.index === "number") {
        const toolCall = readAnthropicToolCall(toolBlocks.get(event.index));
        if (toolCall) {
          yield { type: "tool_use", toolCall };
        }
      }

      if (event.type === "message_delta") {
        outputTokens = readNumber(event, "usage", "output_tokens");
        if (outputTokens !== undefined) {
          yield { type: "usage", outputTokens };
        }
      }

      if (event.type === "message_stop") {
        yield finalMessage(text);
      }
    }
  }
}

function toOpenAiMessages(context: ContextAssembly): Array<{ role: string; content: string }> {
  return context.messages.map((message) => ({
    role: message.role === "tool" ? "user" : message.role,
    content: message.content,
  }));
}

function toAnthropicMessages(
  context: ContextAssembly,
): Array<{ role: "user" | "assistant"; content: string }> {
  return context.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));
}

function toOpenAiResponsesTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: toJSONSchema(tool.inputSchema),
  };
}

function toOpenAiChatTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toJSONSchema(tool.inputSchema),
    },
  };
}

function toAnthropicTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: toJSONSchema(tool.inputSchema),
  };
}

function openAiResponsesRuntimeOptions(config: Config): Record<string, unknown> {
  return removeUndefined({
    temperature: config.runtime.temperature,
    top_p: config.runtime.topP,
    parallel_tool_calls: config.runtime.parallelToolCalls,
    reasoning: config.runtime.reasoningEffort
      ? { effort: config.runtime.reasoningEffort }
      : undefined,
    metadata: config.runtime.metadata,
    store: config.runtime.store,
    service_tier: config.runtime.serviceTier,
    user: config.runtime.user,
  });
}

function openAiChatRuntimeOptions(config: Config): Record<string, unknown> {
  return removeUndefined({
    temperature: config.runtime.temperature,
    top_p: config.runtime.topP,
    stop: config.runtime.stopSequences,
    presence_penalty: config.runtime.presencePenalty,
    frequency_penalty: config.runtime.frequencyPenalty,
    seed: config.runtime.seed,
    tool_choice: config.runtime.toolChoice,
    parallel_tool_calls: config.runtime.parallelToolCalls,
    response_format: config.runtime.responseFormat,
    user: config.runtime.user,
    metadata: config.runtime.metadata,
    store: config.runtime.store,
    service_tier: config.runtime.serviceTier,
    logprobs: config.runtime.logprobs,
    top_logprobs: config.runtime.topLogprobs,
  });
}

function anthropicRuntimeOptions(config: Config): Record<string, unknown> {
  return removeUndefined({
    temperature: config.runtime.temperature,
    top_p: config.runtime.topP,
    top_k: config.runtime.topK,
    stop_sequences: config.runtime.stopSequences,
    metadata: config.runtime.metadata,
    service_tier: config.runtime.serviceTier,
    thinking: config.runtime.thinking,
  });
}

async function* readSse(response: Response): AsyncIterable<ProviderEvent | "[DONE]"> {
  if (!response.body) {
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += value;
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n");

      if (!data) {
        continue;
      }

      if (data === "[DONE]") {
        yield "[DONE]";
        continue;
      }

      yield JSON.parse(data);
    }
  }
}

function readOpenAiToolCall(event: ProviderEvent): ToolCall | undefined {
  const item = asRecord(event.item);
  if (event.type !== "response.output_item.done" || item?.type !== "function_call") {
    return undefined;
  }

  return {
    id: String(item.call_id ?? item.id),
    name: String(item.name),
    input: parseJsonObject(item.arguments),
  };
}

function readOpenAiUsage(event: ProviderEvent): ProviderStreamItem | undefined {
  const usage = asRecord(asRecord(event.response)?.usage);
  if (!usage) {
    return undefined;
  }

  return {
    type: "usage",
    inputTokens: readNumber(usage, "input_tokens"),
    outputTokens: readNumber(usage, "output_tokens"),
  };
}

function readOpenAiChatDeltaText(event: ProviderEvent): string | undefined {
  const delta = firstOpenAiChatDelta(event);
  return typeof delta?.content === "string" ? delta.content : undefined;
}

function collectOpenAiChatToolDelta(
  event: ProviderEvent,
  toolCalls: Map<number, { id: string; name: string; json: string }>,
): void {
  const delta = firstOpenAiChatDelta(event);
  const calls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];

  for (const call of calls) {
    const callRecord = asRecord(call);
    const index = typeof callRecord?.index === "number" ? callRecord.index : 0;
    const functionRecord = asRecord(callRecord?.function);
    const current = toolCalls.get(index) ?? { id: "", name: "", json: "" };

    toolCalls.set(index, {
      id: typeof callRecord?.id === "string" ? callRecord.id : current.id,
      name: typeof functionRecord?.name === "string" ? functionRecord.name : current.name,
      json:
        current.json +
        (typeof functionRecord?.arguments === "string" ? functionRecord.arguments : ""),
    });
  }
}

function readOpenAiChatToolCalls(
  toolCalls: Map<number, { id: string; name: string; json: string }>,
): ToolCall[] {
  return [...toolCalls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => ({
      id: call.id,
      name: call.name,
      input: parseJsonObject(call.json),
    }));
}

function readOpenAiChatUsage(event: ProviderEvent): ProviderStreamItem | undefined {
  const usage = asRecord(event.usage);
  if (!usage) {
    return undefined;
  }

  return {
    type: "usage",
    inputTokens: readNumber(usage, "prompt_tokens"),
    outputTokens: readNumber(usage, "completion_tokens"),
  };
}

function hasOpenAiChatFinishReason(event: ProviderEvent, reason?: string): boolean {
  const choice = firstOpenAiChatChoice(event);
  if (!choice || typeof choice.finish_reason !== "string") {
    return false;
  }

  return reason === undefined || choice.finish_reason === reason;
}

function firstOpenAiChatDelta(event: ProviderEvent): ProviderEvent | undefined {
  return asRecord(firstOpenAiChatChoice(event)?.delta);
}

function firstOpenAiChatChoice(event: ProviderEvent): ProviderEvent | undefined {
  const choices = Array.isArray(event.choices) ? event.choices : [];
  return asRecord(choices[0]);
}

function collectAnthropicToolDelta(
  event: ProviderEvent,
  toolBlocks: Map<number, { id: string; name: string; json: string }>,
): void {
  const contentBlock = asRecord(event.content_block);
  if (event.type === "content_block_start" && contentBlock?.type === "tool_use") {
    const input = asRecord(contentBlock.input) ?? {};
    toolBlocks.set(Number(event.index), {
      id: String(contentBlock.id),
      name: String(contentBlock.name),
      json: Object.keys(input).length > 0 ? JSON.stringify(input) : "",
    });
  }

  const delta = asRecord(event.delta);
  if (event.type === "content_block_delta" && delta?.type === "input_json_delta") {
    const block = toolBlocks.get(Number(event.index));
    if (block) {
      block.json += String(delta.partial_json ?? "");
    }
  }
}

function readAnthropicToolCall(
  block: { id: string; name: string; json: string } | undefined,
): ToolCall | undefined {
  if (!block) {
    return undefined;
  }

  return {
    id: block.id,
    name: block.name,
    input: parseJsonObject(block.json),
  };
}

function finalMessage(content: string): ProviderStreamItem {
  const message: Message = {
    id: "provider-final-message",
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
  };

  return { type: "final_message", message };
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) {
    return {};
  }

  return JSON.parse(value);
}

function readNumber(value: unknown, ...path: string[]): number | undefined {
  let current = value;
  for (const key of path) {
    current = asRecord(current)?.[key];
  }

  return typeof current === "number" ? current : undefined;
}

function asRecord(value: unknown): ProviderEvent | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ProviderEvent)
    : undefined;
}

function assertOkResponse(response: Response): void {
  if (!response.ok) {
    throw new Error(`Provider request failed with status ${response.status}`);
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function optionalHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  return removeUndefined(headers) as Record<string, string>;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
