import { NexaError } from "@/lib/errors";
import { readText } from "@/lib/http";
import { NdjsonDecoder, SseDecoder } from "@/lib/sse";
import type { ApiType, AuthType } from "@/types";
import { BaseAdapter } from "../shared/base-adapter";
import { asArray, asObject, asString, getPath, parseChunk } from "../shared/json";
import type { ChatRequest, ChatResult, ProviderFeature, RemoteModel, StreamEvent } from "../types";

export const DEFAULT_BODY_TEMPLATE = `{
  "model": "{{model}}",
  "messages": {{messages}},
  "stream": {{stream}}
}`;

const FALLBACK_TEXT_PATHS = [
  "choices.0.delta.content",
  "choices.0.message.content",
  "choices.0.text",
  "delta.text",
  "message.content",
  "response",
  "content",
  "text",
  "output",
];

/** Escapes a value for use inside a JSON string literal in the template. */
function escapeForJson(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/** For APIs that follow no standard: the user describes the request and where the text is. */
export class CustomHttpAdapter extends BaseAdapter {
  readonly apiType: ApiType = "custom-http";

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
    return feature === "model-list" ? Boolean(this.config.advanced.modelsPath) : feature === "streaming";
  }

  private textOf(request: ChatRequest): { messages: { role: string; content: string }[]; prompt: string } {
    const messages: { role: string; content: string }[] = request.messages.map((message) => ({
      role: message.role,
      content: message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n"),
    }));
    if (request.system) messages.unshift({ role: "system", content: request.system });
    const prompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    return { messages, prompt };
  }

  protected buildBody(request: ChatRequest, stream: boolean): unknown {
    const template = this.config.advanced.bodyTemplate?.trim() || DEFAULT_BODY_TEMPLATE;
    const { messages, prompt } = this.textOf(request);
    const streaming = stream && (this.config.advanced.streamFormat ?? "sse") !== "none";

    const rendered = template
      .replaceAll("{{model}}", escapeForJson(request.model.modelId))
      .replaceAll("{{messages}}", JSON.stringify(messages))
      .replaceAll("{{prompt}}", escapeForJson(prompt))
      .replaceAll("{{system}}", escapeForJson(request.system ?? ""))
      .replaceAll("{{stream}}", String(streaming));

    try {
      return JSON.parse(rendered);
    } catch {
      throw new NexaError("config", { message: "The body template isn't valid JSON." });
    }
  }

  private extractText(value: unknown): string | undefined {
    const configured = this.config.advanced.responseTextPath?.trim();
    if (configured) return asString(getPath(value, configured));
    for (const path of FALLBACK_TEXT_PATHS) {
      const text = asString(getPath(value, path));
      if (text !== undefined) return text;
    }
    return undefined;
  }

  protected async *decodeStream(response: Response, request: ChatRequest): AsyncGenerator<StreamEvent> {
    const format = this.config.advanced.streamFormat ?? "sse";

    if (format === "none") {
      const text = this.extractText(await this.readJson(response));
      if (text === undefined) throw new NexaError("malformed_response", { details: "No text at the configured response path." });
      yield { type: "text", delta: text };
      yield { type: "finish", reason: "stop" };
      return;
    }

    const sse = format === "sse" ? new SseDecoder() : undefined;
    const ndjson = format === "ndjson" ? new NdjsonDecoder() : undefined;
    const payloads = (chunk: string): string[] => sse?.push(chunk).map((event) => event.data) ?? ndjson?.push(chunk) ?? [];

    const handle = (data: string): StreamEvent | undefined => {
      if (data.trim() === "[DONE]") return undefined;
      const parsed = parseChunk(data);
      const text = parsed ? this.extractText(parsed) : undefined;
      return text ? { type: "text", delta: text } : undefined;
    };

    for await (const text of readText(response, { signal: request.signal })) {
      for (const data of payloads(text)) {
        const event = handle(data);
        if (event) yield event;
      }
    }
    const rest = sse?.flush().map((event) => event.data) ?? ndjson?.flush() ?? [];
    for (const data of rest) {
      const event = handle(data);
      if (event) yield event;
    }
    // A custom protocol has no end marker we can trust, so a clean close counts as complete.
    yield { type: "finish", reason: "stop" };
  }

  protected parseResponse(json: unknown): ChatResult {
    const text = this.extractText(json);
    if (text === undefined) throw new NexaError("malformed_response", { details: "No text at the configured response path." });
    return { text, reasoning: "", toolCalls: [], finishReason: "stop" };
  }

  protected parseModels(json: unknown): RemoteModel[] {
    const root = asObject(json);
    const list = Array.isArray(json) ? json : asArray(root?.data ?? root?.models);
    return list.flatMap((value) => {
      const id = asString(value) ?? asString(asObject(value)?.id) ?? asString(asObject(value)?.name);
      return id ? [{ id }] : [];
    });
  }
}
