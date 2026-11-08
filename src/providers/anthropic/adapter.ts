import { NexaError, errorFromResponse } from "@/lib/errors";
import { readText } from "@/lib/http";
import { SseDecoder } from "@/lib/sse";
import type { ApiType, AuthType, ToolCall, Usage } from "@/types";
import { BaseAdapter } from "../shared/base-adapter";
import { asArray, asNumber, asObject, asString, parseChunk, type JsonObject } from "../shared/json";
import type { ChatMessage, ChatPart, ChatRequest, ChatResult, FinishReason, RemoteModel, StreamEvent } from "../types";

export const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
/** The Messages API requires max_tokens. */
const DEFAULT_MAX_TOKENS = 16_000;

function mapStopReason(reason: string | undefined): FinishReason | undefined {
  switch (reason) {
    case undefined:
      return undefined;
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

function mapPart(part: ChatPart): JsonObject {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return { type: "image", source: { type: "base64", media_type: part.mimeType, data: part.data } };
    case "document":
      return { type: "document", title: part.name, source: { type: "base64", media_type: part.mimeType, data: part.data } };
  }
}

function mapMessage(message: ChatMessage): JsonObject {
  if (message.role === "tool" && message.toolResult) {
    const { toolCallId, content, isError } = message.toolResult;
    return { role: "user", content: [{ type: "tool_result", tool_use_id: toolCallId, content, is_error: isError }] };
  }

  // Documents and images go before the text, as the API recommends.
  const ordered = [...message.parts].sort((a, b) => Number(a.type === "text") - Number(b.type === "text"));
  const content: JsonObject[] = ordered.map(mapPart);
  for (const call of message.toolCalls ?? []) {
    content.push({ type: "tool_use", id: call.id, name: call.name, input: safeJson(call.arguments) });
  }
  return { role: message.role === "tool" ? "user" : message.role, content };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function streamErrorStatus(type: string | undefined): number {
  switch (type) {
    case "rate_limit_error":
      return 429;
    case "overloaded_error":
      return 529;
    case "authentication_error":
      return 401;
    case "permission_error":
      return 403;
    case "not_found_error":
      return 404;
    case "invalid_request_error":
      return 400;
    default:
      return 500;
  }
}

export class AnthropicAdapter extends BaseAdapter {
  readonly apiType: ApiType = "anthropic";

  protected get defaultAuth(): AuthType {
    return "api-key-header";
  }

  protected chatPath(): string {
    return "/messages";
  }

  protected modelsPath(): string {
    return "/models?limit=1000";
  }

  protected override extraHeaders(): Record<string, string> {
    return {
      "anthropic-version": this.config.advanced.anthropicVersion?.trim() || DEFAULT_ANTHROPIC_VERSION,
      // Anthropic requires this explicit opt-in to answer calls made from a browser.
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }

  supportsFeature(): boolean {
    return true;
  }

  protected buildBody(request: ChatRequest, stream: boolean, dropped: ReadonlySet<string>): JsonObject {
    const { params, model } = request;
    const body: JsonObject = {
      model: model.modelId,
      max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: request.messages.map(mapMessage),
    };
    const set = (key: string, value: unknown): void => {
      if (value !== undefined && !dropped.has(key)) body[key] = value;
    };

    if (stream) body.stream = true;
    if (request.system) body.system = request.system;

    const reasoning = Boolean(params.reasoning && model.capabilities.supportsReasoning);
    if (reasoning) {
      set("thinking", { type: "adaptive", display: "summarized" });
      set("output_config", { effort: params.reasoningEffort ?? "medium" });
    } else {
      // Sampling parameters are incompatible with thinking, and removed on recent models.
      set("temperature", params.temperature);
      set("top_p", params.topP);
    }

    if (request.tools?.length && model.capabilities.supportsTools) {
      set(
        "tools",
        request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })),
      );
    }
    return body;
  }

  protected async *decodeStream(response: Response, request: ChatRequest): AsyncGenerator<StreamEvent> {
    const decoder = new SseDecoder();
    let finished = false;
    let completed = false;
    let parsed = 0;
    let malformed = 0;
    const blockToTool = new Map<number, number>();

    const handle = function* (data: string): Generator<StreamEvent> {
      const chunk = parseChunk(data);
      if (!chunk) {
        malformed += 1;
        return;
      }
      parsed += 1;
      const index = asNumber(chunk.index) ?? 0;

      switch (asString(chunk.type)) {
        case "message_start": {
          const usage = asObject(asObject(chunk.message)?.usage);
          const inputTokens = asNumber(usage?.input_tokens);
          if (inputTokens !== undefined) yield { type: "usage", usage: { inputTokens } };
          break;
        }
        case "content_block_start": {
          const block = asObject(chunk.content_block);
          if (asString(block?.type) === "tool_use") {
            const toolIndex = blockToTool.size;
            blockToTool.set(index, toolIndex);
            yield { type: "tool_call", index: toolIndex, id: asString(block?.id), name: asString(block?.name) };
          }
          break;
        }
        case "content_block_delta": {
          const delta = asObject(chunk.delta);
          switch (asString(delta?.type)) {
            case "text_delta": {
              const text = asString(delta?.text);
              if (text) yield { type: "text", delta: text };
              break;
            }
            case "thinking_delta": {
              const thinking = asString(delta?.thinking);
              if (thinking) yield { type: "reasoning", delta: thinking };
              break;
            }
            case "input_json_delta": {
              const toolIndex = blockToTool.get(index);
              if (toolIndex !== undefined) yield { type: "tool_call", index: toolIndex, argumentsDelta: asString(delta?.partial_json) ?? "" };
              break;
            }
          }
          break;
        }
        case "message_delta": {
          const outputTokens = asNumber(asObject(chunk.usage)?.output_tokens);
          if (outputTokens !== undefined) yield { type: "usage", usage: { outputTokens } };
          const reason = mapStopReason(asString(asObject(chunk.delta)?.stop_reason));
          if (reason) {
            finished = true;
            yield { type: "finish", reason };
          }
          break;
        }
        case "message_stop":
          completed = true;
          break;
        case "error": {
          const error = asObject(chunk.error);
          throw errorFromResponse(streamErrorStatus(asString(error?.type)), data);
        }
      }
    };

    for await (const text of readText(response, { signal: request.signal })) {
      for (const event of decoder.push(text)) yield* handle(event.data);
    }
    for (const event of decoder.flush()) yield* handle(event.data);

    if (parsed === 0 && malformed > 0) throw new NexaError("malformed_response");
    if (!finished && !completed) throw new NexaError("stream_interrupted");
    if (!finished) yield { type: "finish", reason: "stop" };
  }

  protected parseResponse(json: unknown): ChatResult {
    const root = asObject(json);
    if (!root || !Array.isArray(root.content)) {
      throw new NexaError("malformed_response", { details: "No content in the response." });
    }

    let text = "";
    let reasoning = "";
    const toolCalls: ToolCall[] = [];
    for (const value of root.content) {
      const block = asObject(value);
      switch (asString(block?.type)) {
        case "text":
          text += asString(block?.text) ?? "";
          break;
        case "thinking":
          reasoning += asString(block?.thinking) ?? "";
          break;
        case "tool_use":
          toolCalls.push({ id: asString(block?.id) ?? "", name: asString(block?.name) ?? "", arguments: JSON.stringify(block?.input ?? {}) });
          break;
      }
    }

    const usageValue = asObject(root.usage);
    const usage: Usage | undefined = usageValue
      ? { inputTokens: asNumber(usageValue.input_tokens), outputTokens: asNumber(usageValue.output_tokens) }
      : undefined;

    return { text, reasoning, toolCalls, usage, finishReason: mapStopReason(asString(root.stop_reason)) };
  }

  protected parseModels(json: unknown): RemoteModel[] {
    return asArray(asObject(json)?.data).flatMap((value) => {
      const model = asObject(value);
      const id = asString(model?.id);
      return id ? [{ id, name: asString(model?.display_name) }] : [];
    });
  }
}

