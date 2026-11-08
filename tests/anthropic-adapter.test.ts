import { describe, expect, it } from "vitest";
import { TEST_KEY, caught, collect, jsonResponse, makeAdapter, makeRequest, mockFetch, sseResponse, textOf } from "./helpers";

const event = (type: string, data: Record<string, unknown>): string => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

const opening = event("message_start", { message: { usage: { input_tokens: 12 } } });
const textDelta = (text: string): string => event("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
const closing = [
  event("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }),
  event("message_stop", {}),
];

const reasoningModel = (): ReturnType<typeof makeRequest>["model"] => {
  const { model } = makeRequest();
  return { ...model, capabilities: { ...model.capabilities, supportsReasoning: true } };
};

describe("Anthropic adapter: request", () => {
  it("uses /messages with the required headers", async () => {
    const { fetch, calls } = mockFetch(sseResponse([opening, ...closing]));
    await collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest()));

    expect(calls[0]?.url).toBe("https://api.example.com/v1/messages");
    expect(calls[0]?.headers).toMatchObject({
      "x-api-key": TEST_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    });
  });

  it("sends the system prompt separately and always sets max_tokens", async () => {
    const { fetch, calls } = mockFetch(sseResponse([opening, ...closing]));
    await collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest({ system: "Be brief" })));

    expect(calls[0]?.body.system).toBe("Be brief");
    expect(calls[0]?.body.max_tokens).toBeGreaterThan(0);
    expect(calls[0]?.body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "Hello" }] }]);
  });

  it("uses adaptive thinking, not a token budget, and no sampling alongside it", async () => {
    const { fetch, calls } = mockFetch(sseResponse([opening, ...closing]));
    await collect(
      makeAdapter("anthropic", fetch).streamMessage(
        makeRequest({ model: reasoningModel(), params: { reasoning: true, reasoningEffort: "high", temperature: 0.2 } }),
      ),
    );

    expect(calls[0]?.body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(calls[0]?.body.output_config).toEqual({ effort: "high" });
    expect(calls[0]?.body).not.toHaveProperty("temperature");
  });

  it("drops temperature when the model rejects it", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse({ type: "error", error: { type: "invalid_request_error", message: "`temperature` is deprecated for this model." } }, 400),
      sseResponse([opening, textDelta("Hi"), ...closing]),
    );
    const events = await collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest({ params: { temperature: 0.7 } })));

    expect(calls[1]?.body).not.toHaveProperty("temperature");
    expect(textOf(events)).toBe("Hi");
  });

  it("places images before text in the Anthropic format", async () => {
    const { fetch, calls } = mockFetch(sseResponse([opening, ...closing]));
    const request = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "Describe" }, { type: "image", mimeType: "image/png", data: "QUJD" }] }],
    });
    await collect(makeAdapter("anthropic", fetch).streamMessage(request));

    expect(calls[0]?.body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
          { type: "text", text: "Describe" },
        ],
      },
    ]);
  });
});

describe("Anthropic adapter: streaming", () => {
  it("yields text, usage and finish", async () => {
    const { fetch } = mockFetch(sseResponse([opening, textDelta("Hel"), textDelta("lo"), ...closing]));
    const events = await collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest()));

    expect(textOf(events)).toBe("Hello");
    expect(events).toContainEqual({ type: "usage", usage: { inputTokens: 12 } });
    expect(events).toContainEqual({ type: "usage", usage: { outputTokens: 3 } });
    expect(events).toContainEqual({ type: "finish", reason: "stop" });
  });

  it("reads thinking deltas and ignores signature deltas", async () => {
    const thinking = event("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "Hmm" } });
    const signature = event("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "abc" } });
    const { fetch } = mockFetch(sseResponse([opening, thinking, signature, ...closing]));
    const events = await collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest()));

    expect(events).toContainEqual({ type: "reasoning", delta: "Hmm" });
    expect(textOf(events)).toBe("");
  });

  it("assembles tool use from input_json_delta", async () => {
    const start = event("content_block_start", { index: 1, content_block: { type: "tool_use", id: "t1", name: "search" } });
    const part = event("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '{"q":1}' } });
    const stop = event("message_delta", { delta: { stop_reason: "tool_use" } });
    const { fetch } = mockFetch(sseResponse([opening, start, part, stop, event("message_stop", {})]));
    const events = await collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest()));

    expect(events).toContainEqual({ type: "tool_call", index: 0, id: "t1", name: "search" });
    expect(events).toContainEqual({ type: "tool_call", index: 0, argumentsDelta: '{"q":1}' });
    expect(events).toContainEqual({ type: "finish", reason: "tool_calls" });
  });

  it("reports a refusal as a finish reason, not a failure", async () => {
    const stop = event("message_delta", { delta: { stop_reason: "refusal" } });
    const { fetch } = mockFetch(sseResponse([opening, stop, event("message_stop", {})]));
    const events = await collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest()));
    expect(events).toContainEqual({ type: "finish", reason: "refusal" });
  });

  it("maps an overloaded error sent inside the stream", async () => {
    const failure = event("error", { error: { type: "overloaded_error", message: "Overloaded" } });
    const { fetch } = mockFetch(sseResponse([opening, failure]));
    const error = await caught(() => collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("unavailable");
  });

  it("reports a truncated stream as interrupted", async () => {
    const { fetch } = mockFetch(sseResponse([opening, textDelta("Part")]));
    const error = await caught(() => collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("stream_interrupted");
  });
});

describe("Anthropic adapter: other calls", () => {
  it("lists models from /models with display names", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ data: [{ id: "claude-x", display_name: "Claude X" }] }));
    const models = await makeAdapter("anthropic", fetch).listModels();

    expect(calls[0]?.url).toContain("/models");
    expect(models).toEqual([{ id: "claude-x", name: "Claude X" }]);
  });

  it("parses a non-streaming message", async () => {
    const { fetch } = mockFetch(
      jsonResponse({ content: [{ type: "text", text: "Hi" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 2 } }),
    );
    const result = await makeAdapter("anthropic", fetch).sendMessage(makeRequest());

    expect(result.text).toBe("Hi");
    expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });

  it("maps 401 to an invalid key", async () => {
    const { fetch } = mockFetch(jsonResponse({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
    const error = await caught(() => collect(makeAdapter("anthropic", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("invalid_api_key");
  });
});
