import { describe, expect, it } from "vitest";
import { TEST_KEY, caught, collect, jsonResponse, makeAdapter, makeRequest, mockFetch, sseResponse, textOf } from "./helpers";

const delta = (content: string): string => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const finish = (reason = "stop"): string => `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\n`;

describe("OpenAI adapter: request", () => {
  it("builds the URL, headers and body from the base URL", async () => {
    const { fetch, calls } = mockFetch(sseResponse([finish(), "data: [DONE]\n\n"]));
    await collect(makeAdapter("openai", fetch).streamMessage(makeRequest({ system: "Be brief" })));

    expect(calls[0]?.url).toBe("https://api.example.com/v1/chat/completions");
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(calls[0]?.init.credentials).toBe("omit");
    expect(calls[0]?.body).toMatchObject({
      model: "test-model",
      stream: true,
      messages: [
        { role: "system", content: "Be brief" },
        { role: "user", content: "Hello" },
      ],
    });
  });

  it("never puts the key in the URL", async () => {
    const { fetch, calls } = mockFetch(sseResponse([finish()]));
    await collect(makeAdapter("openai", fetch).streamMessage(makeRequest()));
    expect(calls[0]?.url).not.toContain(TEST_KEY);
  });

  it("sends only the parameters that are set", async () => {
    const { fetch, calls } = mockFetch(sseResponse([finish()]));
    await collect(makeAdapter("openai", fetch).streamMessage(makeRequest({ params: { temperature: 0.2 } })));

    expect(calls[0]?.body.temperature).toBe(0.2);
    for (const key of ["top_p", "frequency_penalty", "presence_penalty", "max_tokens", "reasoning_effort"]) {
      expect(calls[0]?.body).not.toHaveProperty(key);
    }
  });

  it("does not send reasoning options to a model without reasoning", async () => {
    const { fetch, calls } = mockFetch(sseResponse([finish()]));
    await collect(makeAdapter("openai", fetch).streamMessage(makeRequest({ params: { reasoning: true } })));
    expect(calls[0]?.body).not.toHaveProperty("reasoning_effort");
  });

  it("encodes images as data URLs", async () => {
    const { fetch, calls } = mockFetch(sseResponse([finish()]));
    const request = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "What is this?" }, { type: "image", mimeType: "image/png", data: "QUJD" }] }],
    });
    await collect(makeAdapter("openai", fetch).streamMessage(request));

    expect(calls[0]?.body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
        ],
      },
    ]);
  });

  it("honours a custom endpoint path, query parameters and headers", async () => {
    const { fetch, calls } = mockFetch(sseResponse([finish()]));
    const adapter = makeAdapter("openai", fetch, {
      advanced: { endpointPath: "/deployments/x/chat", queryParams: [{ id: "1", name: "api-version", value: "2024" }] },
      headers: [{ id: "h1", name: "X-Title", value: "NEXA", secret: false }, { id: "h2", name: "X-Secret", value: "", secret: true }],
    });
    await collect(adapter.streamMessage(makeRequest()));

    expect(calls[0]?.url).toBe("https://api.example.com/v1/deployments/x/chat?api-version=2024");
    expect(calls[0]?.headers["X-Title"]).toBe("NEXA");
  });

  it("supports other authentication types", async () => {
    const { fetch, calls } = mockFetch(sseResponse([finish()]));
    const adapter = makeAdapter("openai", fetch, { advanced: { authType: "api-key-header", authHeaderName: "api-key" } });
    await collect(adapter.streamMessage(makeRequest()));

    expect(calls[0]?.headers["api-key"]).toBe(TEST_KEY);
    expect(calls[0]?.headers).not.toHaveProperty("authorization");
  });
});

describe("OpenAI adapter: streaming", () => {
  it("yields text, usage and finish in order", async () => {
    const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}\n\n`;
    const { fetch } = mockFetch(sseResponse([delta("Hel"), delta("lo"), finish(), usage, "data: [DONE]\n\n"]));
    const events = await collect(makeAdapter("openai", fetch).streamMessage(makeRequest()));

    expect(textOf(events)).toBe("Hello");
    expect(events).toContainEqual({ type: "finish", reason: "stop" });
    expect(events).toContainEqual({ type: "usage", usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } });
  });

  it("reassembles a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode(delta("é✓") + finish());
    const { fetch } = mockFetch(sseResponse(Array.from(bytes, (byte) => new Uint8Array([byte]))));
    const events = await collect(makeAdapter("openai", fetch).streamMessage(makeRequest()));
    expect(textOf(events)).toBe("é✓");
  });

  it("reads reasoning deltas", async () => {
    const chunk = `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "Thinking" } }] })}\n\n`;
    const { fetch } = mockFetch(sseResponse([chunk, finish()]));
    const events = await collect(makeAdapter("openai", fetch).streamMessage(makeRequest()));
    expect(events).toContainEqual({ type: "reasoning", delta: "Thinking" });
  });

  it("reads tool call deltas", async () => {
    const first = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "search", arguments: '{"q"' } }] } }] })}\n\n`;
    const second = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"x"}' } }] } }] })}\n\n`;
    const { fetch } = mockFetch(sseResponse([first, second, finish("tool_calls")]));
    const events = await collect(makeAdapter("openai", fetch).streamMessage(makeRequest()));

    expect(events.filter((event) => event.type === "tool_call")).toEqual([
      { type: "tool_call", index: 0, id: "c1", name: "search", argumentsDelta: '{"q"' },
      { type: "tool_call", index: 0, id: undefined, name: undefined, argumentsDelta: ':"x"}' },
    ]);
    expect(events).toContainEqual({ type: "finish", reason: "tool_calls" });
  });

  it("skips one malformed chunk and keeps streaming", async () => {
    const { fetch } = mockFetch(sseResponse([delta("A"), "data: {not json\n\n", delta("B"), finish()]));
    const events = await collect(makeAdapter("openai", fetch).streamMessage(makeRequest()));
    expect(textOf(events)).toBe("AB");
  });

  it("reports a stream made only of garbage as malformed", async () => {
    const { fetch } = mockFetch(sseResponse(["data: <html>\n\n"]));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("malformed_response");
  });

  it("reports a stream that closes before finishing as interrupted", async () => {
    const { fetch } = mockFetch(sseResponse([delta("Partial")]));
    const events: unknown[] = [];
    const error = await caught(async () => {
      for await (const event of makeAdapter("openai", fetch).streamMessage(makeRequest())) events.push(event);
    });
    expect(error.code).toBe("stream_interrupted");
    expect(events).toContainEqual({ type: "text", delta: "Partial" });
  });

  it("reports a broken connection mid-stream as interrupted", async () => {
    const { fetch } = mockFetch(sseResponse([delta("Partial")], new Error("connection reset")));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("stream_interrupted");
  });

  it("surfaces an error sent inside the stream", async () => {
    const { fetch } = mockFetch(sseResponse([`data: ${JSON.stringify({ error: { code: 429, message: "Slow down" } })}\n\n`]));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("rate_limited");
  });

  it("accepts a JSON answer from a server that ignores stream: true", async () => {
    const { fetch } = mockFetch(jsonResponse({ choices: [{ message: { content: "Whole" }, finish_reason: "stop" }] }));
    const events = await collect(makeAdapter("openai", fetch).streamMessage(makeRequest()));
    expect(textOf(events)).toBe("Whole");
  });
});

describe("OpenAI adapter: HTTP errors", () => {
  const cases: [number, string, string][] = [
    [400, "bad_request", "Bad request"],
    [401, "invalid_api_key", "Invalid API key"],
    [403, "access_denied", "Access denied"],
    [404, "not_found", "Model or endpoint not found"],
    [408, "timeout", "Request timeout"],
    [429, "rate_limited", "Rate limit exceeded"],
    [500, "provider_error", "Provider error"],
    [502, "bad_gateway", "Bad gateway"],
    [503, "unavailable", "Provider unavailable"],
  ];

  it.each(cases)("maps HTTP %i to %s", async (status, code, title) => {
    const { fetch } = mockFetch(jsonResponse({ error: { message: "Nope" } }, status));
    const error = (await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())))) as { code: string; title: string };
    expect(error.code).toBe(code);
    expect(error.title).toBe(title);
  });

  it("recognises a missing model", async () => {
    const { fetch } = mockFetch(jsonResponse({ error: { message: "The model `x` does not exist" } }, 404));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("model_not_found");
  });

  it("reads Retry-After on a 429", async () => {
    const { fetch } = mockFetch(jsonResponse({ error: {} }, 429, { "retry-after": "7" }));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(error.retryAfterMs).toBe(7000);
  });

  it("never exposes the key in an error, even when the provider echoes it", async () => {
    const { fetch } = mockFetch(jsonResponse({ error: { message: `Incorrect API key provided: ${TEST_KEY}` } }, 401));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(JSON.stringify(error)).not.toContain(TEST_KEY);
    expect(error.details).not.toContain(TEST_KEY);
  });
});

describe("OpenAI adapter: network failures", () => {
  it("reports a request the browser blocked as CORS", async () => {
    const { fetch } = mockFetch(new TypeError("Failed to fetch"), new Response(null, { status: 200 }));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("cors");
  });

  it("sends no key on the CORS probe", async () => {
    const { fetch, calls } = mockFetch(new TypeError("Failed to fetch"), new Response(null, { status: 200 }));
    await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(calls[1]?.init.mode).toBe("no-cors");
    expect(calls[1]?.init.headers).toBeUndefined();
  });

  it("reports an unreachable server as a network error", async () => {
    const { fetch } = mockFetch(new TypeError("Failed to fetch"), new TypeError("Failed to fetch"));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("network");
  });

  it("times out when the server never answers", async () => {
    const hanging = ((_: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const error = await caught(() => collect(makeAdapter("openai", hanging).streamMessage(makeRequest({ timeoutMs: 10 }))));
    expect(error.code).toBe("timeout");
  });

  it("reports a user stop as aborted", async () => {
    const controller = new AbortController();
    const hanging = ((_: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const pending = caught(() => collect(makeAdapter("openai", hanging).streamMessage(makeRequest({ signal: controller.signal }))));
    controller.abort();
    expect((await pending).code).toBe("aborted");
  });
});

describe("OpenAI adapter: rejected parameters", () => {
  it("drops a parameter the provider rejects, resends, and reports it", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse({ error: { message: "Unsupported parameter: 'temperature' is not supported with this model." } }, 400),
      sseResponse([delta("OK"), finish()]),
    );
    const events = await collect(makeAdapter("openai", fetch).streamMessage(makeRequest({ params: { temperature: 0.2 } })));

    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).not.toHaveProperty("temperature");
    expect(events).toContainEqual({ type: "param_dropped", param: "temperature" });
    expect(textOf(events)).toBe("OK");
  });

  it("renames max_tokens when the model requires max_completion_tokens", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse({ error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } }, 400),
      sseResponse([finish()]),
    );
    await collect(makeAdapter("openai", fetch).streamMessage(makeRequest({ params: { maxTokens: 100 } })));

    expect(calls[1]?.body).not.toHaveProperty("max_tokens");
    expect(calls[1]?.body.max_completion_tokens).toBe(100);
  });

  it("never sends a parameter the model already rejected", async () => {
    const { fetch, calls } = mockFetch(sseResponse([finish()]));
    const base = makeRequest({ params: { temperature: 0.2 } });
    await collect(makeAdapter("openai", fetch).streamMessage({ ...base, model: { ...base.model, unsupportedParams: ["temperature"] } }));
    expect(calls[0]?.body).not.toHaveProperty("temperature");
  });

  it("does not loop on a 400 unrelated to parameters", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ error: { message: "Your prompt is invalid" } }, 400));
    const error = await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest({ params: { temperature: 0.2 } }))));
    expect(error.code).toBe("bad_request");
    expect(calls).toHaveLength(1);
  });
});

describe("OpenAI adapter: connection test and models", () => {
  it("passes on the free model list when the model is listed", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ data: [{ id: "test-model" }] }));
    const result = await makeAdapter("openai", fetch).validateConnection("test-model");

    expect(result.ok).toBe(true);
    expect(result.modelListed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.com/v1/models");
  });

  it("falls back to a tiny chat call when the provider has no model list", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse({}, 404),
      jsonResponse({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }),
    );
    const result = await makeAdapter("openai", fetch).validateConnection("test-model");

    expect(result.ok).toBe(true);
    expect(calls[1]?.url).toContain("/chat/completions");
    expect(calls[1]?.body.max_tokens).toBe(16);
  });

  it("fails on a bad key without a chat call", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ error: { message: "Bad key" } }, 401));
    const result = await makeAdapter("openai", fetch).validateConnection("test-model");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_api_key");
    expect(calls).toHaveLength(1);
  });

  it("reports a model the provider does not know", async () => {
    const { fetch } = mockFetch(
      jsonResponse({ data: [{ id: "other" }] }),
      jsonResponse({ error: { message: "model not found" } }, 404),
    );
    const result = await makeAdapter("openai", fetch).validateConnection("test-model");
    expect(result.error?.code).toBe("model_not_found");
  });
});
