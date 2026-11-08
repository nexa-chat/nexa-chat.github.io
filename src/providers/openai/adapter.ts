import { NexaError, errorFromResponse } from "@/lib/errors";
import { readText } from "@/lib/http";
import { SseDecoder } from "@/lib/sse";
import type { ApiType, AuthType, ToolCall, Usage } from "@/types";
import { BaseAdapter } from "../shared/base-adapter";
import { asArray, asNumber, asObject, asString, parseChunk, type JsonObject } from "../shared/json";
import type { ChatMessage, ChatRequest, ChatResult, FinishReason, ProviderFeature, RemoteModel, StreamEvent } from "../types";

function mapFinishReason(reason: string | undefined): FinishReason | undefined {
  switch (reason) {
    case undefined:
      return undefined;
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}

function mapUsage(value: unknown): Usage | undefined {
  const usage = asObject(value);
  if (!usage) return undefined;
  return {
    inputTokens: asNumber(usage.prompt_tokens),
    outputTokens: asNumber(usage.completion_tokens),
    totalTokens: asNumber(usage.total_tokens),
  };
}

function mapMessage(message: ChatMessage): JsonObject {
  if (message.role === "tool" && message.toolResult) {
    return { role: "tool", tool_call_id: message.toolResult.toolCallId, content: message.toolResult.content };
  }

  const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
  const images = message.parts.flatMap((part) => (part.type === "image" ? [part] : []));

  const mapped: JsonObject = { role: message.role };
  if (images.length === 0) {
    mapped.content = text;
  } else {
    mapped.content = [
      ...(text ? [{ type: "text", text }] : []),
      ...images.map((image) => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } })),
    ];
  }

  if (message.toolCalls?.length) {
    mapped.tool_calls = message.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    }));
  }
  return mapped;
}

export class OpenAIAdapter extends BaseAdapter {
  readonly apiType: ApiType = "openai";

  protected get defaultAuth(): AuthType {
    return "bearer";
  }

  protected chatPath(): string {
    return "/chat/completions";
  }

  protected modelsPath(): string {
    return "/models";
  }

  supportsFeature(feature: ProviderFeature): boolean {
    return feature !== "native-pdf";
  }

  /** Reasoning parameters differ between OpenAI-compatible servers. */
  protected reasoningBody(request: ChatRequest): JsonObject {
    return { reasoning_effort: request.params.reasoningEffort ?? "medium" };
  }

  protected buildBody(request: ChatRequest, stream: boolean, dropped: ReadonlySet<string>): JsonObject {
    const { params, model } = request;
    const messages = request.messages.map(mapMessage);
    if (request.system) messages.unshift({ role: "system", content: request.system });

    const body: JsonObject = { model: model.modelId, messages, stream };
    const set = (key: string, value: unknown): void => {
      if (value !== undefined && !dropped.has(key)) body[key] = value;
    };

    if (stream) set("stream_options", { include_usage: true });
    set("temperature", params.temperature);
    set("top_p", params.topP);
    set("frequency_penalty", params.frequencyPenalty);
    set("presence_penalty", params.presencePenalty);

    if (params.maxTokens !== undefined) {
      if (!dropped.has("max_tokens")) body.max_tokens = params.maxTokens;
      else set("max_completion_tokens", params.maxTokens);
    }

    if (params.reasoning && model.capabilities.supportsReasoning) {
      for (const [key, value] of Object.entries(this.reasoningBody(request))) set(key, value);
    }

    if (request.tools?.length && model.capabilities.supportsTools) {
      set(
        "tools",
        request.tools.map((tool) => ({
          type: "function",
          function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
        })),
      );
    }
    return body;
  }

  protected async *decodeStream(response: Response, request: ChatRequest): AsyncGenerator<StreamEvent> {
    const decoder = new SseDecoder();
    let finished = false;
    let sawDone = false;
    let parsed = 0;
    let malformed = 0;

    const handle = function* (this: OpenAIAdapter, data: string): Generator<StreamEvent> {
      if (data.trim() === "[DONE]") {
        sawDone = true;
        return;
      }
      const chunk = parseChunk(data);
      if (!chunk) {
        malformed += 1;
        return;
      }
      parsed += 1;

      if (chunk.error !== undefined) {
        const status = asNumber(asObject(chunk.error)?.code) ?? 500;
        throw errorFromResponse(status, data);
      }

      const usage = mapUsage(chunk.usage);
      if (usage) yield { type: "usage", usage };

      const choice = asObject(asArray(chunk.choices)[0]);
      if (!choice) return;
      const delta = asObject(choice.delta) ?? {};

      const reasoning = asString(delta.reasoning_content) ?? asString(delta.reasoning);
      if (reasoning) yield { type: "reasoning", delta: reasoning };

      const content = asString(delta.content);
      if (content) yield { type: "text", delta: content };

      for (const value of asArray(delta.tool_calls)) {
        const call = asObject(value);
        if (!call) continue;
        const fn = asObject(call.function);
        yield {
          type: "tool_call",
          index: asNumber(call.index) ?? 0,
          id: asString(call.id),
          name: asString(fn?.name),
          argumentsDelta: asString(fn?.arguments),
        };
      }

      const reason = mapFinishReason(asString(choice.finish_reason) ?? undefined);
      if (reason) {
        finished = true;
        yield { type: "finish", reason };
      }
    }.bind(this);

    for await (const text of readText(response, { signal: request.signal })) {
      for (const event of decoder.push(text)) yield* handle(event.data);
    }
    for (const event of decoder.flush()) yield* handle(event.data);

    if (parsed === 0 && malformed > 0) throw new NexaError("malformed_response");
    if (!finished && !sawDone) throw new NexaError("stream_interrupted");
    if (!finished) yield { type: "finish", reason: "stop" };
  }

  protected parseResponse(json: unknown): ChatResult {
    const root = asObject(json);
    const choice = asObject(asArray(root?.choices)[0]);
    const message = asObject(choice?.message);
    if (!message) throw new NexaError("malformed_response", { details: "No choices in the response." });

    const toolCalls: ToolCall[] = asArray(message.tool_calls).flatMap((value) => {
      const call = asObject(value);
      const fn = asObject(call?.function);
      const name = asString(fn?.name);
      return name ? [{ id: asString(call?.id) ?? "", name, arguments: asString(fn?.arguments) ?? "" }] : [];
    });

    return {
      text: asString(message.content) ?? "",
      reasoning: asString(message.reasoning_content) ?? asString(message.reasoning) ?? "",
      toolCalls,
      usage: mapUsage(root?.usage),
      finishReason: mapFinishReason(asString(choice?.finish_reason)),
    };
  }

  protected parseModels(json: unknown): RemoteModel[] {
    const root = asObject(json);
    const list = Array.isArray(json) ? json : asArray(root?.data ?? root?.models);
    return list.flatMap((value) => {
      const model = asObject(value);
      const id = asString(model?.id) ?? asString(model?.name);
      return id ? [{ id, name: asString(model?.name) }] : [];
    });
  }
}
