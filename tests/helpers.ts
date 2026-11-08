import type { ChatRequest, ProviderAdapter, StreamEvent } from "@/providers";
import { providerRegistry } from "@/providers";
import type { ApiType, ProviderConfig, ProviderSecrets } from "@/types";

export const TEST_KEY = "sk-test-SECRETVALUE1234567890";

export function makeProvider(apiType: ApiType, overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: "prv_test",
    name: "Test",
    apiType,
    baseUrl: "https://api.example.com/v1",
    headers: [],
    advanced: {},
    connection: "direct",
    health: "not_tested",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

export function makeAdapter(
  apiType: ApiType,
  fetchImpl: typeof fetch,
  overrides: Partial<ProviderConfig> = {},
  secrets: ProviderSecrets = { apiKey: TEST_KEY },
): ProviderAdapter {
  return providerRegistry.create({ config: makeProvider(apiType, overrides), secrets, fetchImpl });
}

export function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: {
      modelId: "test-model",
      unsupportedParams: [],
      capabilities: {
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsReasoning: false,
        supportsImages: true,
        supportsFiles: false,
      },
    },
    messages: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }],
    params: {},
    ...overrides,
  };
}

/** A streaming body delivered in the exact chunks given, optionally failing at the end. */
export function streamBody(chunks: readonly (string | Uint8Array)[], failure?: Error): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      if (failure) controller.error(failure);
      else controller.close();
    },
  });
}

export function sseResponse(chunks: readonly (string | Uint8Array)[], failure?: Error): Response {
  return new Response(streamBody(chunks, failure), { status: 200, headers: { "content-type": "text/event-stream" } });
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export interface RecordedCall {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** A fetch that answers with queued responses and records every call. */
export function mockFetch(...responses: (Response | Error)[]): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    calls.push({ url: String(input), init, body, headers: (init.headers ?? {}) as Record<string, string> });
    const next = responses.shift();
    if (!next) throw new Error("mockFetch: no response queued");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

export async function collect(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

export function textOf(events: readonly StreamEvent[]): string {
  return events.flatMap((event) => (event.type === "text" ? [event.delta] : [])).join("");
}

export async function caught(run: () => Promise<unknown>): Promise<{ code?: string; message?: string; details?: string; status?: number; retryAfterMs?: number }> {
  try {
    await run();
  } catch (error) {
    return error as { code?: string };
  }
  throw new Error("Expected the call to throw");
}
