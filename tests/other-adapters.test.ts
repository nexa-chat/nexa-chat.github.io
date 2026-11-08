import { describe, expect, it } from "vitest";
import { TEST_KEY, caught, collect, jsonResponse, makeAdapter, makeRequest, mockFetch, sseResponse, streamBody, textOf } from "./helpers";

const geminiChunk = (text: string, finishReason?: string): string =>
  `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
  })}\n\n`;

describe("Gemini adapter", () => {
  it("streams through the alt=sse endpoint with the key in a header", async () => {
    const { fetch, calls } = mockFetch(sseResponse([geminiChunk("Hel"), geminiChunk("lo", "STOP")]));
    const adapter = makeAdapter("gemini", fetch, { baseUrl: "https://generativelanguage.googleapis.com/v1beta" });
    const events = await collect(adapter.streamMessage(makeRequest({ system: "Be brief" })));

    expect(calls[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-model:streamGenerateContent?alt=sse");
    expect(calls[0]?.url).not.toContain(TEST_KEY);
    expect(calls[0]?.headers["x-goog-api-key"]).toBe(TEST_KEY);
    expect(calls[0]?.body.systemInstruction).toEqual({ parts: [{ text: "Be brief" }] });
    expect(textOf(events)).toBe("Hello");
    expect(events).toContainEqual({ type: "finish", reason: "stop" });
  });

  it("renames the assistant role and maps generation settings", async () => {
    const { fetch, calls } = mockFetch(sseResponse([geminiChunk("x", "STOP")]));
    const request = makeRequest({
      messages: [
        { role: "user", parts: [{ type: "text", text: "A" }] },
        { role: "assistant", parts: [{ type: "text", text: "B" }] },
        { role: "user", parts: [{ type: "text", text: "C" }] },
      ],
      params: { temperature: 0.5, maxTokens: 10 },
    });
    await collect(makeAdapter("gemini", fetch).streamMessage(request));

    expect(calls[0]?.body.generationConfig).toEqual({ temperature: 0.5, maxOutputTokens: 10 });
    expect((calls[0]?.body.contents as { role: string }[]).map((content) => content.role)).toEqual(["user", "model", "user"]);
  });

  it("separates thought parts from text", async () => {
    const chunk = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hmm", thought: true }, { text: "Answer" }] }, finishReason: "STOP" }] })}\n\n`;
    const { fetch } = mockFetch(sseResponse([chunk]));
    const events = await collect(makeAdapter("gemini", fetch).streamMessage(makeRequest()));

    expect(events).toContainEqual({ type: "reasoning", delta: "Hmm" });
    expect(textOf(events)).toBe("Answer");
  });

  it("treats a blocked prompt as a refusal", async () => {
    const { fetch } = mockFetch(sseResponse([`data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}\n\n`]));
    const events = await collect(makeAdapter("gemini", fetch).streamMessage(makeRequest()));
    expect(events).toContainEqual({ type: "finish", reason: "refusal" });
  });

  it("reports a truncated stream as interrupted", async () => {
    const { fetch } = mockFetch(sseResponse([geminiChunk("Part")]));
    const error = await caught(() => collect(makeAdapter("gemini", fetch).streamMessage(makeRequest())));
    expect(error.code).toBe("stream_interrupted");
  });

  it("lists chat models only and strips the prefix", async () => {
    const { fetch } = mockFetch(
      jsonResponse({
        models: [
          { name: "models/gemini-x", displayName: "Gemini X", supportedGenerationMethods: ["generateContent"] },
          { name: "models/embed", supportedGenerationMethods: ["embedContent"] },
        ],
      }),
    );
    expect(await makeAdapter("gemini", fetch).listModels()).toEqual([{ id: "gemini-x", name: "Gemini X" }]);
  });
});

describe("OpenRouter adapter", () => {
  it("adds attribution headers and its reasoning field", async () => {
    const { model } = makeRequest();
    const { fetch, calls } = mockFetch(sseResponse([`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`]));
    await collect(
      makeAdapter("openrouter", fetch).streamMessage(
        makeRequest({
          model: { ...model, capabilities: { ...model.capabilities, supportsReasoning: true } },
          params: { reasoning: true, reasoningEffort: "low" },
        }),
      ),
    );

    expect(calls[0]?.headers["x-title"]).toBe("NEXA");
    expect(calls[0]?.body.reasoning).toEqual({ effort: "low" });
    expect(calls[0]?.body).not.toHaveProperty("reasoning_effort");
  });

  it("reads capabilities and per-million prices from the model list", async () => {
    const { fetch } = mockFetch(
      jsonResponse({
        data: [
          {
            id: "a/b",
            name: "Model B",
            architecture: { input_modalities: ["text", "image"] },
            supported_parameters: ["tools"],
            pricing: { prompt: "0.000003", completion: "0.000015" },
          },
        ],
      }),
    );
    const [model] = await makeAdapter("openrouter", fetch).listModels();

    expect(model?.capabilities).toMatchObject({ supportsVision: true, supportsTools: true, supportsReasoning: false });
    expect(model?.pricing).toEqual({ inputPerMTok: 3, outputPerMTok: 15 });
  });
});

describe("Custom HTTP adapter", () => {
  it("renders the body template with safely escaped values", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ result: "Done" }));
    const adapter = makeAdapter("custom-http", fetch, {
      advanced: { bodyTemplate: '{"q":"{{prompt}}","m":"{{model}}"}', responseTextPath: "result", streamFormat: "none" },
    });
    const request = makeRequest({ messages: [{ role: "user", parts: [{ type: "text", text: 'He said "hi"\n' }] }] });
    const events = await collect(adapter.streamMessage(request));

    expect(calls[0]?.body).toEqual({ q: 'He said "hi"\n', m: "test-model" });
    expect(textOf(events)).toBe("Done");
  });

  it("reads SSE text from a configured path", async () => {
    const { fetch } = mockFetch(sseResponse([`data: ${JSON.stringify({ out: { t: "Hi" } })}\n\n`, "data: [DONE]\n\n"]));
    const adapter = makeAdapter("custom-http", fetch, { advanced: { responseTextPath: "out.t", streamFormat: "sse" } });
    expect(textOf(await collect(adapter.streamMessage(makeRequest())))).toBe("Hi");
  });

  it("reads newline-delimited JSON", async () => {
    const response = new Response(streamBody(['{"response":"Hel"}\n{"resp', 'onse":"lo"}\n']), { headers: { "content-type": "application/x-ndjson" } });
    const { fetch } = mockFetch(response);
    const adapter = makeAdapter("custom-http", fetch, { advanced: { streamFormat: "ndjson" } });
    expect(textOf(await collect(adapter.streamMessage(makeRequest())))).toBe("Hello");
  });

  it("uses the configured method and basic auth", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ text: "x" }));
    const adapter = makeAdapter("custom-http", fetch, { advanced: { method: "PUT", authType: "basic", streamFormat: "none" } }, { apiKey: "user:pass" });
    await collect(adapter.streamMessage(makeRequest()));

    expect(calls[0]?.init.method).toBe("PUT");
    expect(calls[0]?.headers.authorization).toBe(`Basic ${btoa("user:pass")}`);
  });

  it("explains an invalid template", async () => {
    const { fetch } = mockFetch(jsonResponse({}));
    const adapter = makeAdapter("custom-http", fetch, { advanced: { bodyTemplate: "{oops" } });
    const error = await caught(() => collect(adapter.streamMessage(makeRequest())));
    expect(error.code).toBe("config");
  });

  it("reports a response with no text at the path as unreadable", async () => {
    const { fetch } = mockFetch(jsonResponse({ nothing: true }));
    const adapter = makeAdapter("custom-http", fetch, { advanced: { responseTextPath: "a.b", streamFormat: "none" } });
    const error = await caught(() => collect(adapter.streamMessage(makeRequest())));
    expect(error.code).toBe("malformed_response");
  });
});

describe("Relay mode", () => {
  it("sends the request through the same-origin relay only when chosen", async () => {
    const ok = sseResponse([`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`]);
    const { fetch, calls } = mockFetch(ok);
    await collect(makeAdapter("openai", fetch, { connection: "relay" }).streamMessage(makeRequest()));

    expect(calls[0]?.url).toBe("/api/relay");
    expect(calls[0]?.body.url).toBe("https://api.example.com/v1/chat/completions");
  });

  it("explains when the deployment has no relay", async () => {
    const { fetch } = mockFetch(new Response("", { status: 404 }));
    const error = await caught(() => collect(makeAdapter("openai", fetch, { connection: "relay" }).streamMessage(makeRequest())));
    expect(error.code).toBe("relay_unavailable");
  });
});

describe("Configuration checks", () => {
  it("rejects an invalid header name before any request", () => {
    const { fetch } = mockFetch();
    expect(() => makeAdapter("openai", fetch, { headers: [{ id: "1", name: "Bad Header", value: "x", secret: false }] })).toThrow(/valid header/);
  });

  it("rejects an unparseable base URL", () => {
    const { fetch } = mockFetch();
    expect(() => makeAdapter("openai", fetch, { baseUrl: "not a url" })).toThrow();
  });
});
