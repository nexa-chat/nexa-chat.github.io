import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexaError } from "@/lib/errors";
import type { ChatRequest, ProviderAdapter, StreamEvent } from "@/providers";
import { BackupError, applyBackup, createBackup, parseBackup, previewBackup } from "@/services/backup";
import { buildChatMessages } from "@/services/context";
import { fileNameFor, toHtml, toJson, toMarkdown, toPlainText } from "@/services/export";
import { FileRejectedError, blobToBase64, detectFileType, processFile } from "@/services/files";
import { runGeneration } from "@/services/generation";
import { ThinkFilter } from "@/services/think-filter";
import { deleteProvider, saveProvider, type ProviderDraft } from "@/services/provider-service";
import { invalidateSearchIndex, searchChats } from "@/services/search";
import { MemoryStorage, getStorage, getVault, setStorageForTesting } from "@/storage";
import type { Conversation, Message, ModelCapabilities, ModelConfig } from "@/types";
import { makeRequest } from "./helpers";

function conversation(id: string, title = "Chat"): Conversation {
  return {
    id,
    title,
    titleSource: "user",
    systemPreset: "default",
    systemPrompt: "",
    preset: "balanced",
    favorite: false,
    archived: false,
    messageCount: 0,
    createdAt: 1,
    updatedAt: 1,
    metadata: {},
  };
}

function message(id: string, overrides: Partial<Message> = {}): Message {
  return { id, conversationId: "c1", role: "user", content: "Hello", status: "complete", createdAt: 1, updatedAt: 1, ...overrides };
}

function draft(overrides: Partial<ProviderDraft> = {}): ProviderDraft {
  return {
    name: "Keryos",
    apiType: "openai",
    baseUrl: "https://api.example.com/v1/",
    headers: [],
    advanced: {},
    connection: "direct",
    apiKey: "sk-supersecret-1234",
    secretHeaders: {},
    ...overrides,
  };
}

const NO_CAPS: ModelCapabilities = { supportsVision: false, supportsImages: false, supportsTools: false, supportsStreaming: true, supportsReasoning: false, supportsFiles: false };

beforeEach(() => {
  setStorageForTesting(new MemoryStorage());
  invalidateSearchIndex();
});

function adapterFrom(run: (attempt: number) => AsyncGenerator<StreamEvent>): ProviderAdapter {
  let attempt = 0;
  return {
    streamMessage: () => run(attempt++),
    normalizeError: (error: unknown) => (error instanceof NexaError ? error : new NexaError("unknown")),
  } as unknown as ProviderAdapter;
}

describe("runGeneration", () => {
  it("forwards text and collects usage and tool calls", async () => {
    const adapter = adapterFrom(async function* () {
      yield { type: "text", delta: "Hi" };
      yield { type: "tool_call", index: 0, id: "1", name: "t", argumentsDelta: "{" };
      yield { type: "tool_call", index: 0, argumentsDelta: "}" };
      yield { type: "usage", usage: { inputTokens: 1 } };
      yield { type: "usage", usage: { outputTokens: 2 } };
      yield { type: "finish", reason: "stop" };
    });
    const onText = vi.fn();
    const outcome = await runGeneration({ adapter, request: makeRequest(), autoRetry: false, callbacks: { onText } });

    expect(onText).toHaveBeenCalledWith("Hi");
    expect(outcome.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: undefined });
    expect(outcome.toolCalls).toEqual([{ id: "1", name: "t", arguments: "{}" }]);
    expect(outcome.finishReason).toBe("stop");
  });

  it("does not retry once text has been shown", async () => {
    const run = vi.fn(async function* (): AsyncGenerator<StreamEvent> {
      yield { type: "text", delta: "Part" };
      throw new NexaError("stream_interrupted");
    });
    const outcome = await runGeneration({ adapter: adapterFrom(run), request: makeRequest(), autoRetry: true, callbacks: {} });

    expect(run).toHaveBeenCalledTimes(1);
    expect(outcome.error?.code).toBe("stream_interrupted");
  });

  it("returns a permanent error without retrying", async () => {
    const run = vi.fn(async function* (): AsyncGenerator<StreamEvent> {
      throw new NexaError("invalid_api_key");
    });
    const outcome = await runGeneration({ adapter: adapterFrom(run), request: makeRequest(), autoRetry: true, callbacks: {} });

    expect(run).toHaveBeenCalledTimes(1);
    expect(outcome.error?.code).toBe("invalid_api_key");
  });

  it("makes no automatic retry when the setting is off", async () => {
    const run = vi.fn(async function* (): AsyncGenerator<StreamEvent> {
      throw new NexaError("unavailable");
    });
    await runGeneration({ adapter: adapterFrom(run), request: makeRequest(), autoRetry: false, callbacks: {} });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("marks a user stop as stopped, not failed", async () => {
    const controller = new AbortController();
    const adapter = adapterFrom(async function* () {
      yield { type: "text", delta: "Part" };
      controller.abort();
      throw new NexaError("aborted");
    });
    const outcome = await runGeneration({ adapter, request: makeRequest({ signal: controller.signal }), autoRetry: true, callbacks: {} });

    expect(outcome.stopped).toBe(true);
    expect(outcome.error).toBeUndefined();
  });
});

describe("inline reasoning", () => {
  function run(chunks: string[]): { text: string; reasoning: string } {
    const filter = new ThinkFilter();
    let text = "";
    let reasoning = "";
    for (const delta of [...chunks.map((chunk) => filter.push(chunk)), filter.flush()]) {
      text += delta.text;
      reasoning += delta.reasoning;
    }
    return { text, reasoning };
  }

  it("moves a leading think block out of the answer", () => {
    expect(run(["<think>Hmm</think>\n\nAnswer"])).toEqual({ text: "Answer", reasoning: "Hmm" });
  });

  it("handles tags split across chunks at any position", () => {
    const source = "<think>Plan</think>Done";
    for (let split = 1; split < source.length; split += 1) {
      expect(run([source.slice(0, split), source.slice(split)])).toEqual({ text: "Done", reasoning: "Plan" });
    }
  });

  it("handles one character at a time", () => {
    expect(run([..."<think>ab</think>cd"])).toEqual({ text: "cd", reasoning: "ab" });
  });

  it("leaves an answer that merely mentions the tag", () => {
    expect(run(["The <think> tag is used by some models."])).toEqual({ text: "The <think> tag is used by some models.", reasoning: "" });
  });

  it("keeps text that only looks like the start of a tag", () => {
    expect(run(["<th", "ing>"])).toEqual({ text: "<thing>", reasoning: "" });
    expect(run(["<"])).toEqual({ text: "<", reasoning: "" });
  });

  it("keeps reasoning from a stream that never closes the tag", () => {
    expect(run(["<think>Unfinished"])).toEqual({ text: "", reasoning: "Unfinished" });
  });
});

describe("buildChatMessages", () => {
  const adapter = { supportsFeature: () => false };

  it("skips empty turns and non-chat roles", async () => {
    const messages = [message("1"), message("2", { role: "assistant", content: "" }), message("3", { role: "system" })];
    expect(await buildChatMessages(messages, NO_CAPS, adapter)).toHaveLength(1);
  });

  it("never sends an image to a model without vision", async () => {
    const attachment = { id: "a1", name: "cat.png", mimeType: "image/png", size: 4, kind: "image" as const };
    await getStorage().put("blobs", { id: "a1", blob: new Blob(["data"]) });
    const [result] = await buildChatMessages([message("1", { attachments: [attachment] })], NO_CAPS, adapter);

    expect(result?.parts.some((part) => part.type === "image")).toBe(false);
    expect(result?.parts[0]).toEqual({ type: "text", text: "[Image not sent to this model: cat.png]" });
  });

  it("sends an image to a vision model", async () => {
    const attachment = { id: "a1", name: "cat.png", mimeType: "image/png", size: 4, kind: "image" as const };
    await getStorage().put("blobs", { id: "a1", blob: new Blob(["data"]) });
    const [result] = await buildChatMessages([message("1", { attachments: [attachment] })], { ...NO_CAPS, supportsVision: true }, adapter);

    expect(result?.parts[0]).toMatchObject({ type: "image", mimeType: "image/png" });
  });

  it("sends a PDF natively only when both model and provider can read it", async () => {
    const attachment = { id: "a1", name: "doc.pdf", mimeType: "application/pdf", size: 4, kind: "pdf" as const, extractedText: "Body" };
    await getStorage().put("blobs", { id: "a1", blob: new Blob(["data"]) });
    const native = await buildChatMessages([message("1", { attachments: [attachment] })], { ...NO_CAPS, supportsFiles: true }, { supportsFeature: () => true });
    const text = await buildChatMessages([message("1", { attachments: [attachment] })], NO_CAPS, adapter);

    expect(native[0]?.parts[0]).toMatchObject({ type: "document" });
    expect(text[0]?.parts[0]).toMatchObject({ type: "text" });
    expect(JSON.stringify(text)).toContain("Body");
  });
});

describe("provider service", () => {
  it("stores a masked hint and keeps the key out of the provider record", async () => {
    const saved = await saveProvider(draft());
    const record = await getStorage().get("providers", saved.id);

    expect(record?.keyHint).toBe("1234");
    expect(JSON.stringify(record)).not.toContain("supersecret");
    expect((await getVault().get(saved.id)).apiKey).toBe("sk-supersecret-1234");
  });

  it("normalises the base URL", async () => {
    expect((await saveProvider(draft())).baseUrl).toBe("https://api.example.com/v1");
  });

  it("keeps the stored key when the form leaves it unchanged", async () => {
    const saved = await saveProvider(draft());
    await saveProvider(draft({ id: saved.id, name: "Renamed", apiKey: undefined }), saved);
    expect((await getVault().get(saved.id)).apiKey).toBe("sk-supersecret-1234");
  });

  it("keeps secret header values out of the provider record", async () => {
    const headers = [{ id: "h1", name: "X-Key", value: "should-be-removed", secret: true }];
    const saved = await saveProvider(draft({ headers, secretHeaders: { h1: "hidden-value" } }));

    expect(saved.headers[0]?.value).toBe("");
    expect((await getVault().get(saved.id)).headers?.h1).toBe("hidden-value");
  });

  it("deleting a provider removes its key and its models", async () => {
    const saved = await saveProvider(draft());
    await getStorage().put("models", { id: "m1", providerId: saved.id } as ModelConfig);
    await deleteProvider(saved.id);

    expect(await getVault().get(saved.id)).toEqual({});
    expect(await getStorage().getAll("models")).toEqual([]);
    expect(await getStorage().get("providers", saved.id)).toBeUndefined();
  });
});

describe("backup", () => {
  async function seed(): Promise<string> {
    const saved = await saveProvider(draft());
    await getStorage().put("conversations", conversation("c1", "First"));
    await getStorage().put("messages", message("m1"));
    return saved.id;
  }

  it("leaves keys out by default", async () => {
    await seed();
    const text = JSON.stringify(await createBackup({ includeKeys: false }));
    expect(text).not.toContain("supersecret");
    expect(JSON.parse(text)).not.toHaveProperty("secrets");
  });

  it("includes keys only when asked", async () => {
    const id = await seed();
    const backup = await createBackup({ includeKeys: true });
    expect(backup.secrets?.[id]?.apiKey).toBe("sk-supersecret-1234");
  });

  it("restores everything into an empty store", async () => {
    await seed();
    const backup = parseBackup(JSON.stringify(await createBackup({ includeKeys: true })));
    setStorageForTesting(new MemoryStorage());
    await applyBackup(backup, "merge");

    expect(await getStorage().getAll("conversations")).toHaveLength(1);
    expect(await getStorage().getAll("messages")).toHaveLength(1);
    expect((await getVault().get(backup.providers[0]?.id ?? "")).apiKey).toBe("sk-supersecret-1234");
  });

  it("merging never overwrites an existing conversation", async () => {
    await seed();
    const backup = await createBackup({ includeKeys: false });
    await getStorage().put("conversations", conversation("c1", "Edited since"));
    await applyBackup(backup, "merge");
    expect((await getStorage().get("conversations", "c1"))?.title).toBe("Edited since");
  });

  it("replace removes what the backup does not contain", async () => {
    await seed();
    const backup = await createBackup({ includeKeys: false });
    await getStorage().put("conversations", conversation("c2", "Newer"));
    await applyBackup(backup, "replace");
    expect((await getStorage().getAll("conversations")).map((item) => item.id)).toEqual(["c1"]);
  });

  it("previews conflicts before anything is written", async () => {
    await seed();
    const backup = await createBackup({ includeKeys: false });
    expect(await previewBackup(backup)).toMatchObject({ conversations: 1, messages: 1, conflicts: 1, includesKeys: false });
  });

  it.each([
    ["not json", "{oops", /valid JSON/],
    ["another file", '{"hello":1}', /isn't a NEXA backup/],
    ["a newer version", '{"format":"nexa-backup","version":99}', /newer version/],
    ["missing data", '{"format":"nexa-backup","version":1,"conversations":"x"}', /damaged/],
    ["bad records", '{"format":"nexa-backup","version":1,"conversations":[{"nope":1}],"messages":[],"providers":[],"models":[]}', /damaged/],
  ])("rejects %s", (_, text, pattern) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
    expect(() => parseBackup(text)).toThrow(pattern);
  });
});

describe("conversation export", () => {
  const chat = conversation("c1", "Rust notes");
  const messages = [message("1", { content: "Hi" }), message("2", { role: "assistant", content: "Hello", model: { modelConfigId: "m", modelName: "Claude", providerName: "A" } })];

  it("writes Markdown", () => {
    expect(toMarkdown(chat, messages)).toBe("# Rust notes\n\n## You\n\nHi\n\n## Claude\n\nHello\n");
  });

  it("writes plain text", () => {
    expect(toPlainText(chat, messages)).toContain("You:\nHi");
  });

  it("writes JSON that parses back", () => {
    expect(JSON.parse(toJson(chat, messages)).messages).toHaveLength(2);
  });

  it("escapes HTML so a shared file can't run script", () => {
    const html = toHtml(conversation("c", "<img src=x onerror=alert(1)>"), [message("1", { content: "<script>alert(1)</script>" })]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("makes safe file names", () => {
    expect(fileNameFor("Comprendre: les WebSockets!", "md")).toBe("comprendre-les-websockets.md");
    expect(fileNameFor("../../etc/passwd", "md")).toBe("etc-passwd.md");
    expect(fileNameFor("???", "md")).toBe("conversation.md");
  });
});

describe("search", () => {
  const context = { providers: [], models: [] };

  it("finds conversations by title", async () => {
    const hits = await searchChats("rust", [conversation("c1", "Rust notes"), conversation("c2", "Other")], context);
    expect(hits.map((hit) => hit.conversationId)).toEqual(["c1"]);
  });

  it("finds conversations by message content, with a snippet", async () => {
    await getStorage().put("messages", message("m1", { content: "The quick brown fox" }));
    const [hit] = await searchChats("brown", [conversation("c1", "Animals")], context);
    expect(hit?.snippet).toContain("brown");
  });

  it("finds conversations by model and provider", async () => {
    const model = { id: "m1", name: "Claude Opus", modelId: "x", providerId: "p1" } as ModelConfig;
    const chat = { ...conversation("c1", "Untitled"), modelConfigId: "m1" };
    expect(await searchChats("claude", [chat], { providers: [], models: [model] })).toHaveLength(1);
  });

  it("returns nothing for an empty query", async () => {
    expect(await searchChats("  ", [conversation("c1")], context)).toEqual([]);
  });
});

describe("file validation", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

  it("accepts a real PNG", async () => {
    const result = await processFile(new File([png], "a.png", { type: "image/png" }));
    expect(result.attachment).toMatchObject({ kind: "image", mimeType: "image/png" });
    expect(result.blob).toBeDefined();
  });

  it("rejects a file whose content doesn't match its extension", async () => {
    await expect(processFile(new File(["<html>"], "fake.png"))).rejects.toThrow(FileRejectedError);
  });

  it("rejects unsupported types such as SVG and executables", async () => {
    await expect(processFile(new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }))).rejects.toThrow(/isn't supported/);
    await expect(processFile(new File(["MZ"], "a.exe"))).rejects.toThrow(/isn't supported/);
  });

  it("rejects an empty file", async () => {
    await expect(processFile(new File([], "a.txt"))).rejects.toThrow(/empty/);
  });

  it("rejects a file over the limit", async () => {
    const file = new File(["x"], "a.txt");
    Object.defineProperty(file, "size", { value: 40 * 1024 * 1024 });
    await expect(processFile(file)).rejects.toThrow(/larger than/);
  });

  it("extracts text from text files", async () => {
    const result = await processFile(new File(["# Hello"], "a.md"));
    expect(result.attachment.extractedText).toBe("# Hello");
    expect(result.blob).toBeUndefined();
  });

  it("names a pasted image from its type", () => {
    expect(detectFileType("", "image/webp")?.kind).toBe("image");
  });

  it("encodes bytes to base64", async () => {
    expect(await blobToBase64(new Blob(["ABC"]))).toBe("QUJD");
  });
});

export type { ChatRequest };
