import { NexaError, errorFromResponse } from "@/lib/errors";
import { readText } from "@/lib/http";
import { SseDecoder } from "@/lib/sse";
import type { ApiType, AuthType, ToolCall, Usage } from "@/types";
import { BaseAdapter } from "../shared/base-adapter";
import { asArray, asNumber, asObject, asString, parseChunk, type JsonObject } from "../shared/json";
import type { ChatMessage, ChatPart, ChatRequest, ChatResult, FinishReason, RemoteModel, StreamEvent } from "../types";

function mapFinishReason(reason: string | undefined): FinishReason | undefined {
  switch (reason) {
    case undefined:
      return undefined;
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "PROHIBITED_CONTENT":
    case "BLOCKLIST":
      return "refusal";
    default:
      return "other";
  }
}

function mapUsage(value: unknown): Usage | undefined {
  const usage = asObject(value);
  if (!usage) return undefined;
  return {
    inputTokens: asNumber(usage.promptTokenCount),
    outputTokens: asNumber(usage.candidatesTokenCount),
    totalTokens: asNumber(usage.totalTokenCount),
  };
}

function mapPart(part: ChatPart): JsonObject {
  if (part.type === "text") return { text: part.text };
  return { inlineData: { mimeType: part.mimeType, data: part.data } };
}

function mapMessage(message: ChatMessage): JsonObject {
  if (message.role === "tool" && message.toolResult) {
    return {
      role: "user",
      parts: [{ functionResponse: { name: message.toolResult.toolCallId, response: { content: message.toolResult.content } } }],
    };
  }
  const parts: JsonObject[] = message.parts.map(mapPart);
  for (const call of message.toolCalls ?? []) {
    parts.push({ functionCall: { name: call.name, args: safeJson(call.arguments) } });
  }
  return { role: message.role === "assistant" ? "model" : "user", parts };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export class GeminiAdapter extends BaseAdapter {
  readonly apiType: ApiType = "gemini";

  protected get defaultAuth(): AuthType {
    return "api-key-header";
  }

  /** The key travels in a header, never in the URL. */
  protected override authHeaders(): Record<string, string> {
    if (this.config.advanced.authType) return super.authHeaders();
    return this.apiKey ? { "x-goog-api-key": this.apiKey } : {};
  }

  protected chatPath(modelId: string, stream: boolean): string {
    const model = encodeURIComponent(modelId.replace(/^models\//, ""));
    return stream ? `/models/${model}:streamGenerateContent?alt=sse` : `/models/${model}:generateContent`;
  }

  protected modelsPath(): string {
    return "/models?pageSize=1000";
  }

  supportsFeature(): boolean {
    return true;
  }

  protected buildBody(request: ChatRequest, _stream: boolean, dropped: ReadonlySet<string>): JsonObject {
    const { params, model } = request;
    const generationConfig: JsonObject = {};
    const set = (key: string, wireName: string, value: unknown): void => {
      if (value !== undefined && !dropped.has(key) && !dropped.has(wireName)) generationConfig[wireName] = value;
    };

    set("temperature", "temperature", params.temperature);
    set("top_p", "topP", params.topP);
    set("max_tokens", "maxOutputTokens", params.maxTokens);
    if (params.reasoning && model.capabilities.supportsReasoning) {
      set("thinking", "thinkingConfig", { includeThoughts: true });
    }

    const body: JsonObject = { contents: request.messages.map(mapMessage) };
    if (request.system) body.systemInstruction = { parts: [{ text: request.system }] };
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
    if (request.tools?.length && model.capabilities.supportsTools && !dropped.has("tools")) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          })),
        },
      ];
    }
    return body;
  }

  private *eventsFrom(chunk: JsonObject, data: string, toolCount: { value: number }): Generator<StreamEvent> {
    if (chunk.error !== undefined) {
      throw errorFromResponse(asNumber(asObject(chunk.error)?.code) ?? 500, data);
    }

    const usage = mapUsage(chunk.usageMetadata);
    if (usage) yield { type: "usage", usage };

    if (asString(asObject(chunk.promptFeedback)?.blockReason)) {
      yield { type: "finish", reason: "refusal" };
      return;
    }

    const candidate = asObject(asArray(chunk.candidates)[0]);
    if (!candidate) return;

    for (const value of asArray(asObject(candidate.content)?.parts)) {
      const part = asObject(value);
      const text = asString(part?.text);
      if (text) yield { type: part?.thought === true ? "reasoning" : "text", delta: text };

      const call = asObject(part?.functionCall);
      const name = asString(call?.name);
      if (name) {
        yield { type: "tool_call", index: toolCount.value, id: name, name, argumentsDelta: JSON.stringify(call?.args ?? {}) };
        toolCount.value += 1;
      }
    }

    const reason = mapFinishReason(asString(candidate.finishReason));
    if (reason) yield { type: "finish", reason };
  }

  protected async *decodeStream(response: Response, request: ChatRequest): AsyncGenerator<StreamEvent> {
    const decoder = new SseDecoder();
    const toolCount = { value: 0 };
    let finished = false;
    let parsed = 0;
    let malformed = 0;

    const handle = function* (this: GeminiAdapter, data: string): Generator<StreamEvent> {
      const chunk = parseChunk(data);
      if (!chunk) {
        malformed += 1;
        return;
      }
      parsed += 1;
      for (const event of this.eventsFrom(chunk, data, toolCount)) {
        if (event.type === "finish") finished = true;
        yield event;
      }
    }.bind(this);

    for await (const text of readText(response, { signal: request.signal })) {
      for (const event of decoder.push(text)) yield* handle(event.data);
    }
    for (const event of decoder.flush()) yield* handle(event.data);

    if (parsed === 0 && malformed > 0) throw new NexaError("malformed_response");
    if (!finished) throw new NexaError("stream_interrupted");
  }

  protected parseResponse(json: unknown): ChatResult {
    const root = asObject(json);
    if (!root) throw new NexaError("malformed_response");

    let text = "";
    let reasoning = "";
    const toolCalls: ToolCall[] = [];
    let usage: Usage | undefined;
    let finishReason: FinishReason | undefined;

    for (const event of this.eventsFrom(root, JSON.stringify(root), { value: 0 })) {
      switch (event.type) {
        case "text":
          text += event.delta;
          break;
        case "reasoning":
          reasoning += event.delta;
          break;
        case "tool_call":
          toolCalls.push({ id: event.id ?? "", name: event.name ?? "", arguments: event.argumentsDelta ?? "" });
          break;
        case "usage":
          usage = event.usage;
          break;
        case "finish":
          finishReason = event.reason;
          break;
      }
    }
    return { text, reasoning, toolCalls, usage, finishReason };
  }

  protected parseModels(json: unknown): RemoteModel[] {
    return asArray(asObject(json)?.models).flatMap((value) => {
      const model = asObject(value);
      const id = asString(model?.name)?.replace(/^models\//, "");
      const methods = asArray(model?.supportedGenerationMethods);
      if (!id || (methods.length > 0 && !methods.includes("generateContent"))) return [];
      return [{ id, name: asString(model?.displayName) }];
    });
  }
}
