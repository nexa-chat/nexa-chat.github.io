import { NexaError, errorFromResponse, isAbortError, toNexaError } from "@/lib/errors";
import { HttpClient, safeText } from "@/lib/http";
import { redactSecrets } from "@/lib/redact";
import { assertUrl, joinUrl, withQuery } from "@/lib/url";
import type { ApiType, AuthType, ProviderConfig, ToolCall } from "@/types";
import type {
  AdapterContext,
  ChatRequest,
  ChatResult,
  ConnectionResult,
  ProviderAdapter,
  ProviderFeature,
  RemoteModel,
  StreamEvent,
} from "../types";
import { detectUnsupportedParam } from "./unsupported-params";

const MAX_PARAM_RETRIES = 4;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export function collectToolCalls(calls: Map<number, ToolCall>, event: Extract<StreamEvent, { type: "tool_call" }>): void {
  const current = calls.get(event.index) ?? { id: "", name: "", arguments: "" };
  calls.set(event.index, {
    id: event.id ?? current.id,
    name: event.name ?? current.name,
    arguments: current.arguments + (event.argumentsDelta ?? ""),
  });
}

export abstract class BaseAdapter implements ProviderAdapter {
  abstract readonly apiType: ApiType;
  protected readonly config: ProviderConfig;
  protected readonly apiKey: string;
  protected readonly http: HttpClient;
  private readonly secretHeaders: Record<string, string>;

  constructor(context: AdapterContext) {
    this.config = context.config;
    this.apiKey = context.secrets.apiKey ?? "";
    this.secretHeaders = context.secrets.headers ?? {};
    this.http = new HttpClient({ connection: context.config.connection, fetchImpl: context.fetchImpl });
  }

  protected abstract get defaultAuth(): AuthType;
  protected abstract chatPath(modelId: string, stream: boolean): string;
  protected abstract modelsPath(): string;
  protected abstract buildBody(request: ChatRequest, stream: boolean, dropped: ReadonlySet<string>): unknown;
  protected abstract decodeStream(response: Response, request: ChatRequest): AsyncGenerator<StreamEvent>;
  protected abstract parseResponse(json: unknown): ChatResult;
  protected abstract parseModels(json: unknown): RemoteModel[];
  abstract supportsFeature(feature: ProviderFeature): boolean;

  initialize(): void {
    assertUrl(this.config.baseUrl);
    for (const header of this.config.headers) {
      if (header.name && !HEADER_NAME.test(header.name)) {
        throw new NexaError("config", { message: `"${header.name}" isn't a valid header name.` });
      }
    }
  }

  resolveChatUrl(modelId: string, stream: boolean): string {
    const path = this.config.advanced.endpointPath?.trim() || this.chatPath(modelId, stream);
    return withQuery(joinUrl(this.config.baseUrl, path), this.config.advanced.queryParams);
  }

  protected authHeaders(): Record<string, string> {
    const { authType = this.defaultAuth, authHeaderName, authPrefix } = this.config.advanced;
    if (!this.apiKey || authType === "none") return {};
    switch (authType) {
      case "bearer":
        return { authorization: `Bearer ${this.apiKey}` };
      case "api-key-header":
        return { [authHeaderName?.trim() || "x-api-key"]: this.apiKey };
      case "basic":
        return { authorization: `Basic ${btoa(this.apiKey)}` };
      case "custom":
        return { [authHeaderName?.trim() || "authorization"]: `${authPrefix ?? ""}${this.apiKey}` };
    }
  }

  /** Provider-specific headers that are not credentials. */
  protected extraHeaders(): Record<string, string> {
    return {};
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.extraHeaders(),
      ...this.authHeaders(),
    };
    for (const entry of this.config.headers) {
      const name = entry.name.trim();
      if (!name) continue;
      const value = entry.secret ? this.secretHeaders[entry.id] : entry.value;
      if (value !== undefined && value !== "") headers[name] = value;
    }
    return headers;
  }

  protected knownSecrets(): string[] {
    return [this.apiKey, ...Object.values(this.secretHeaders)].filter((value) => value.length > 0);
  }

  private chatRequestUrl(request: ChatRequest, stream: boolean): string {
    const override = request.model.endpoint?.trim();
    if (override) return withQuery(joinUrl(this.config.baseUrl, override), this.config.advanced.queryParams);
    return this.resolveChatUrl(request.model.modelId, stream);
  }

  /** Sends the chat request, dropping any parameter the provider rejects. */
  private async *postChat(request: ChatRequest, stream: boolean): AsyncGenerator<StreamEvent | { type: "response"; response: Response }> {
    const dropped = new Set(request.model.unsupportedParams);

    for (let attempt = 0; ; attempt += 1) {
      const response = await this.http.send({
        url: this.chatRequestUrl(request, stream),
        method: this.config.advanced.method ?? "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildBody(request, stream, dropped)),
        signal: request.signal,
        timeoutMs: request.timeoutMs,
      });

      if (response.ok) {
        yield { type: "response", response };
        return;
      }

      const body = redactSecrets(await safeText(response), this.knownSecrets());
      const param = response.status === 400 || response.status === 422 ? detectUnsupportedParam(body) : undefined;
      if (param && !dropped.has(param) && attempt < MAX_PARAM_RETRIES) {
        dropped.add(param);
        yield { type: "param_dropped", param };
        continue;
      }
      throw errorFromResponse(response.status, body, response.headers.get("retry-after"));
    }
  }

  async *streamMessage(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const stream = request.model.capabilities.supportsStreaming;

    for await (const event of this.postChat(request, stream)) {
      if (event.type !== "response") {
        yield event;
        continue;
      }
      const { response } = event;
      // "application/x-ndjson" is a stream, so match the JSON type exactly.
      const contentType = response.headers.get("content-type") ?? "";
      if (stream && !contentType.toLowerCase().startsWith("application/json")) {
        yield* this.decodeStream(response, request);
      } else {
        // Some servers ignore stream: true and answer with a single JSON document.
        yield* this.resultToEvents(this.parseResponse(await this.readJson(response)));
      }
    }
  }

  async sendMessage(request: ChatRequest): Promise<ChatResult> {
    for await (const event of this.postChat(request, false)) {
      if (event.type === "response") return this.parseResponse(await this.readJson(event.response));
    }
    throw new NexaError("malformed_response");
  }

  private *resultToEvents(result: ChatResult): Generator<StreamEvent> {
    if (result.reasoning) yield { type: "reasoning", delta: result.reasoning };
    if (result.text) yield { type: "text", delta: result.text };
    for (const [index, call] of result.toolCalls.entries()) {
      yield { type: "tool_call", index, id: call.id, name: call.name, argumentsDelta: call.arguments };
    }
    if (result.usage) yield { type: "usage", usage: result.usage };
    yield { type: "finish", reason: result.finishReason ?? "stop" };
  }

  protected async readJson(response: Response): Promise<unknown> {
    const text = await safeText(response);
    try {
      return JSON.parse(text);
    } catch {
      throw new NexaError("malformed_response", { details: redactSecrets(text.slice(0, 300), this.knownSecrets()) });
    }
  }

  async listModels(signal?: AbortSignal): Promise<RemoteModel[]> {
    const path = this.config.advanced.modelsPath?.trim() || this.modelsPath();
    const headers = this.buildHeaders();
    delete headers["content-type"];
    const response = await this.http.sendOk({
      url: withQuery(joinUrl(this.config.baseUrl, path), this.config.advanced.queryParams),
      method: "GET",
      headers,
      signal,
      timeoutMs: 15_000,
    });
    return this.parseModels(await this.readJson(response));
  }

  async validateConnection(modelId?: string, signal?: AbortSignal): Promise<ConnectionResult> {
    const started = Date.now();
    const elapsed = (): number => Date.now() - started;

    let models: RemoteModel[] | undefined;
    if (this.supportsFeature("model-list")) {
      try {
        models = await this.listModels(signal);
        if (!modelId) return { ok: true, latencyMs: elapsed(), models };
        if (models.some((model) => model.id === modelId)) {
          return { ok: true, latencyMs: elapsed(), models, modelListed: true };
        }
      } catch (caught) {
        const error = this.normalizeError(caught);
        // Keep going only when the failure says nothing about the chat endpoint.
        const listUnavailable = ["not_found", "model_not_found", "malformed_response", "bad_request", "unknown"].includes(error.code);
        if (!listUnavailable || !modelId) return { ok: false, latencyMs: elapsed(), error };
      }
    }

    if (!modelId) {
      return { ok: false, latencyMs: elapsed(), error: new NexaError("config", { message: "Enter a model ID to test this connection." }) };
    }

    try {
      await this.sendMessage({
        model: { modelId, unsupportedParams: [], capabilities: PING_CAPABILITIES },
        messages: [{ role: "user", parts: [{ type: "text", text: "Reply with OK." }] }],
        params: { maxTokens: 16 },
        signal,
        timeoutMs: 30_000,
      });
      return { ok: true, latencyMs: elapsed(), models, modelListed: models ? false : undefined };
    } catch (caught) {
      return { ok: false, latencyMs: elapsed(), models, error: this.normalizeError(caught) };
    }
  }

  normalizeError(error: unknown): NexaError {
    if (isAbortError(error)) return new NexaError("aborted");
    return toNexaError(error);
  }
}

const PING_CAPABILITIES = {
  supportsVision: false,
  supportsTools: false,
  supportsStreaming: false,
  supportsReasoning: false,
  supportsImages: false,
  supportsFiles: false,
};
