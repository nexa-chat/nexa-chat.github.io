import { describe, expect, it, vi } from "vitest";
import { inferCapabilities, prettifyModelName } from "@/lib/capabilities";
import { NexaError, errorFromResponse } from "@/lib/errors";
import { estimateCost, resolveParams } from "@/lib/params";
import { keyHint, maskKey, redactSecrets } from "@/lib/redact";
import { backoffDelay, withRetry } from "@/lib/retry";
import { hostOf, isMixedContent, joinUrl, normalizeBaseUrl, validateBaseUrl, withQuery } from "@/lib/url";
import { detectUnsupportedParam } from "@/providers/shared/unsupported-params";
import { cleanTitle, heuristicTitle } from "@/services/titles";

describe("URL handling", () => {
  it("builds the endpoint from a base URL", () => {
    expect(joinUrl("https://api.example.com/v1", "/chat/completions")).toBe("https://api.example.com/v1/chat/completions");
    expect(joinUrl("https://api.example.com/v1/", "chat/completions")).toBe("https://api.example.com/v1/chat/completions");
  });

  it("forgives a pasted full endpoint", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1/chat/completions/")).toBe("https://api.example.com/v1");
    expect(normalizeBaseUrl("https://api.example.com/v1/messages")).toBe("https://api.example.com/v1");
  });

  it("accepts an absolute endpoint override", () => {
    expect(joinUrl("https://a.com", "https://b.com/x")).toBe("https://b.com/x");
  });

  it("appends query parameters", () => {
    expect(withQuery("https://a.com/x", [{ name: "v", value: "1" }, { name: "", value: "skip" }])).toBe("https://a.com/x?v=1");
  });

  it("validates base URLs in plain language", () => {
    expect(validateBaseUrl("https://a.com/v1")).toBeNull();
    expect(validateBaseUrl("")).toMatch(/Enter/);
    expect(validateBaseUrl("nope")).toMatch(/valid URL/);
    expect(validateBaseUrl("ftp://a.com")).toMatch(/https/);
    expect(validateBaseUrl("https://user:pw@a.com")).toMatch(/credentials/);
  });

  it("detects mixed content but allows localhost", () => {
    expect(isMixedContent("http://api.example.com", "https:")).toBe(true);
    expect(isMixedContent("http://localhost:11434/v1", "https:")).toBe(false);
    expect(isMixedContent("http://127.0.0.1:1234", "https:")).toBe(false);
    expect(isMixedContent("https://api.example.com", "https:")).toBe(false);
  });

  it("extracts the host for display", () => {
    expect(hostOf("https://api.anthropic.com/v1")).toBe("api.anthropic.com");
  });
});

describe("Secret redaction", () => {
  it("removes known secrets", () => {
    expect(redactSecrets("key is hunter2-abc", ["hunter2-abc"])).toBe("key is [redacted]");
  });

  it("removes credential-shaped strings", () => {
    expect(redactSecrets("sk-ant-api03-abcdefghijklmnop")).toBe("[redacted]");
    expect(redactSecrets("AIzaSyA1234567890abcdefghijkl")).toBe("[redacted]");
    expect(redactSecrets("Authorization: Bearer abc.def.ghi123")).toBe("Authorization: [redacted]");
    expect(redactSecrets("https://x.com/a?key=secret123&b=2")).toBe("https://x.com/a?key=[redacted]&b=2");
  });

  it("leaves ordinary text alone", () => {
    expect(redactSecrets("The model was not found")).toBe("The model was not found");
  });

  it("redacts details on every NexaError", () => {
    const error = new NexaError("unknown", { details: "failed with sk-abcdefghijklmnopqrstuvwx" });
    expect(error.details).not.toContain("sk-abc");
  });

  it("masks keys showing only the last four characters", () => {
    expect(maskKey(keyHint("sk-abcdefgh1234"))).toBe("••••••••••••••••1234");
    expect(keyHint("short")).toBe("••••");
    expect(keyHint("")).toBe("");
  });
});

describe("Error normalisation", () => {
  it("reads the usual provider error shapes", () => {
    expect(errorFromResponse(400, '{"error":{"message":"Bad thing"}}').details).toContain("Bad thing");
    expect(errorFromResponse(400, '{"message":"Flat"}').details).toContain("Flat");
    expect(errorFromResponse(400, '{"detail":"Fast"}').details).toContain("Fast");
    expect(errorFromResponse(500, "<html>oops</html>").details).toContain("oops");
  });

  it("recognises quota and context errors regardless of status", () => {
    expect(errorFromResponse(429, '{"error":{"code":"insufficient_quota"}}').code).toBe("quota_exceeded");
    expect(errorFromResponse(400, "maximum context length exceeded").code).toBe("context_too_long");
  });

  it("marks only temporary failures as retryable", () => {
    expect(new NexaError("rate_limited").retryable).toBe(true);
    expect(new NexaError("unavailable").retryable).toBe(true);
    expect(new NexaError("invalid_api_key").retryable).toBe(false);
    expect(new NexaError("cors").retryable).toBe(false);
  });
});

describe("Unsupported parameter detection", () => {
  it.each([
    ["Unsupported parameter: 'temperature' is not supported", "temperature"],
    ["`temperature` and `top_p` cannot both be specified", "temperature"],
    ["top_p: Extra inputs are not permitted", "top_p"],
    ["Unknown name \"thinkingConfig\" at 'generation_config'", "thinkingConfig"],
    ["Unrecognized request argument: stream_options", "stream_options"],
  ])("finds the parameter in %s", (message, param) => {
    expect(detectUnsupportedParam(JSON.stringify({ error: { message } }))).toBe(param);
  });

  it("ignores errors that don't reject a parameter", () => {
    expect(detectUnsupportedParam('{"error":{"message":"temperature must be below 2"}}')).toBeUndefined();
    expect(detectUnsupportedParam('{"error":{"message":"Bad image"}}')).toBeUndefined();
  });
});

describe("Retry", () => {
  const noWait = async (): Promise<void> => undefined;

  it("retries a temporary failure, then succeeds", async () => {
    const run = vi.fn().mockRejectedValueOnce(new NexaError("unavailable")).mockResolvedValueOnce("ok");
    await expect(withRetry(run, { maxRetries: 2, sleep: noWait })).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never retries a permanent failure", async () => {
    const run = vi.fn().mockRejectedValue(new NexaError("invalid_api_key"));
    await expect(withRetry(run, { maxRetries: 2, sleep: noWait })).rejects.toMatchObject({ code: "invalid_api_key" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("stops after the retry limit", async () => {
    const run = vi.fn().mockRejectedValue(new NexaError("unavailable"));
    await expect(withRetry(run, { maxRetries: 2, sleep: noWait })).rejects.toMatchObject({ code: "unavailable" });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("waits as long as Retry-After asks", async () => {
    const wait = vi.fn(noWait);
    const run = vi.fn().mockRejectedValueOnce(new NexaError("rate_limited", { retryAfterMs: 3000 })).mockResolvedValueOnce("ok");
    await withRetry(run, { maxRetries: 1, sleep: wait });
    expect(wait).toHaveBeenCalledWith(3000, undefined);
  });

  it("leaves a long Retry-After to the user instead of waiting", async () => {
    const run = vi.fn().mockRejectedValue(new NexaError("rate_limited", { retryAfterMs: 60_000 }));
    await expect(withRetry(run, { maxRetries: 2, sleep: noWait })).rejects.toMatchObject({ code: "rate_limited" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially up to the ceiling", () => {
    const delay = (attempt: number): number => backoffDelay(attempt, 1000, 8000, () => 1);
    expect([delay(0), delay(1), delay(2), delay(5)]).toEqual([1000, 2000, 4000, 8000]);
  });

  it("reports each retry", async () => {
    const onRetry = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new NexaError("unavailable")).mockResolvedValueOnce("ok");
    await withRetry(run, { maxRetries: 1, sleep: noWait, onRetry, random: () => 0 });
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }));
  });
});

describe("Generation parameters", () => {
  const capabilities = { supportsVision: false, supportsTools: false, supportsStreaming: true, supportsReasoning: false, supportsImages: false, supportsFiles: false };

  it("removes reasoning from a model that lacks it", () => {
    expect(resolveParams({ parameters: {}, capabilities }, "reasoning")).toEqual({ maxTokens: undefined, temperature: 0.2 });
  });

  it("keeps reasoning on a capable model", () => {
    const params = resolveParams({ parameters: {}, capabilities: { ...capabilities, supportsReasoning: true } }, "reasoning");
    expect(params).toMatchObject({ temperature: 0.2, reasoning: true });
  });

  it("uses the model's own values for the custom preset", () => {
    expect(resolveParams({ parameters: { temperature: 0.9, topP: 0.5 }, capabilities }, "custom")).toEqual({ temperature: 0.9, topP: 0.5 });
  });

  it("estimates cost only when both prices and usage exist", () => {
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, { inputPerMTok: 2, outputPerMTok: 10 })).toBe(7);
    expect(estimateCost({ inputTokens: 100 }, undefined)).toBeUndefined();
    expect(estimateCost(undefined, { inputPerMTok: 1 })).toBeUndefined();
    expect(estimateCost({ inputTokens: 1 }, {})).toBeUndefined();
  });
});

describe("Capabilities", () => {
  it("recognises common families, including through gateways", () => {
    expect(inferCapabilities("openai", "anthropic/claude-opus-4-7")).toMatchObject({ supportsVision: true, supportsReasoning: true, supportsTools: true });
    expect(inferCapabilities("openai", "llama-2-7b")).toMatchObject({ supportsVision: false, supportsReasoning: false });
  });

  it("assumes nothing for custom HTTP", () => {
    expect(inferCapabilities("custom-http", "claude-opus-4-7")).toMatchObject({ supportsVision: false, supportsTools: false });
  });

  it("prettifies model IDs", () => {
    expect(prettifyModelName("anthropic/claude-opus-4-7")).toBe("Claude Opus 4.7");
    expect(prettifyModelName("gpt-4o-mini")).toBe("GPT 4o Mini");
    expect(prettifyModelName("claude-sonnet-5-5-20260101")).toBe("Claude Sonnet 5.5");
  });
});

describe("Titles", () => {
  it("keeps a short first sentence", () => {
    expect(heuristicTitle("Explain WebSockets. I need details.")).toBe("Explain WebSockets.");
  });

  it("never produces a huge title", () => {
    const title = heuristicTitle("word ".repeat(100));
    expect(title.length).toBeLessThanOrEqual(49);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back when there is no text", () => {
    expect(heuristicTitle("   ")).toBe("New chat");
  });

  it("cleans model output", () => {
    expect(cleanTitle('"Comprendre WebSockets".')).toBe("Comprendre WebSockets");
    expect(cleanTitle("Title: Rust lifetimes")).toBe("Rust lifetimes");
    expect(cleanTitle("<think>hmm</think>\nSQL joins")).toBe("SQL joins");
    expect(cleanTitle("   ")).toBeUndefined();
  });
});
