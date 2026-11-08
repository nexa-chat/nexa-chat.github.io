import { beforeEach, describe, expect, it, vi } from "vitest";
import { continueMessage, deleteMessage, editMessage, regenerate, resolveModel, sendMessage, stopGeneration, switchBranch } from "@/features/chat/chat-actions";
import { useChatStore } from "@/features/chat/chat-store";
import { useProviderStore } from "@/features/providers/provider-store";
import { useSettingsStore } from "@/features/settings/settings-store";
import { groupByDate } from "@/features/sidebar/group-conversations";
import { hasMath, normalizeMathDelimiters, splitMarkdownBlocks } from "@/features/markdown/split-blocks";
import { CONTINUE_INSTRUCTION } from "@/services/context";
import { modelFromRemote, saveProvider } from "@/services/provider-service";
import { MemoryStorage, getStorage, setStorageForTesting } from "@/storage";
import { DEFAULT_SETTINGS, type Conversation } from "@/types";
import { sseResponse } from "./helpers";

const delta = (content: string): string => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const done = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;

function respondWith(...replies: string[]): { bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return sseResponse([delta(replies.shift() ?? "Answer"), done]);
  });
  return { bodies };
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

  setStorageForTesting(new MemoryStorage());
  useChatStore.setState({ conversations: [], folders: [], activeId: null, messages: [], streams: {}, draftModelId: undefined });
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, autoTitle: false, autoRetry: false } });

  const provider = await saveProvider({
    name: "Keryos",
    apiType: "openai",
    baseUrl: "https://api.example.com/v1",
    headers: [],
    advanced: {},
    connection: "direct",
    apiKey: "sk-test-key-123456",
    secretHeaders: {},
  });
  const model = modelFromRemote(provider.id, "openai", "test-model");
  await getStorage().put("models", model);
  useProviderStore.setState({ providers: [provider], models: [model], loaded: true });
});

describe("sending a message", () => {
  it("creates the conversation lazily and persists both messages", async () => {
    respondWith("Hello there");
    await sendMessage("Hi");

    const { conversations, messages } = useChatStore.getState();
    expect(conversations).toHaveLength(1);
    expect(messages.map((message) => [message.role, message.content, message.status])).toEqual([
      ["user", "Hi", "complete"],
      ["assistant", "Hello there", "complete"],
    ]);
    expect(await getStorage().messagesFor(conversations[0]?.id ?? "")).toHaveLength(2);
  });

  it("names the chat from the first message", async () => {
    respondWith("Sure");
    await sendMessage("Explain WebSockets");
    expect(useChatStore.getState().conversations[0]?.title).toBe("Explain WebSockets");
  });

  it("sends the whole conversation on the next turn", async () => {
    const { bodies } = respondWith("First", "Second");
    await sendMessage("One");
    await sendMessage("Two");
    expect((bodies[1]?.messages as unknown[]).length).toBe(3);
  });

  it("uses the conversation's system instructions", async () => {
    const { bodies } = respondWith("OK");
    useChatStore.setState({ draftSystemPreset: "custom", draftSystemPrompt: "Answer in French" });
    await sendMessage("Hi");
    expect((bodies[0]?.messages as { role: string; content: string }[])[0]).toEqual({ role: "system", content: "Answer in French" });
  });

  it("keeps partial text and records the failure when a stream breaks", async () => {
    vi.stubGlobal("fetch", async () => sseResponse([delta("Partial answer")]));
    await sendMessage("Hi");

    const assistant = useChatStore.getState().messages.at(-1);
    expect(assistant?.content).toBe("Partial answer");
    expect(assistant?.status).toBe("error");
    expect(assistant?.error?.code).toBe("stream_interrupted");
  });

  it("records provider errors on the message", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"error":{"message":"no"}}', { status: 401 }));
    await sendMessage("Hi");
    expect(useChatStore.getState().messages.at(-1)?.error?.title).toBe("Invalid API key");
  });

  it("clears the live stream once finished", async () => {
    respondWith("Done");
    await sendMessage("Hi");
    expect(useChatStore.getState().streams).toEqual({});
  });

  it("marks a stopped response as stopped and keeps its text", async () => {
    vi.stubGlobal("fetch", (_: string, init: RequestInit) => {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(delta("Partial")));
          init.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
        },
      });
      return Promise.resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
    });

    const pending = sendMessage("Hi");
    await vi.waitFor(() => expect(Object.values(useChatStore.getState().streams)[0]?.phase).toBe("streaming"));
    stopGeneration(useChatStore.getState().activeId);
    await pending;

    const assistant = useChatStore.getState().messages.at(-1);
    expect(assistant?.status).toBe("stopped");
    expect(assistant?.content).toBe("Partial");
  });

  it("remembers a rejected parameter for next time", async () => {
    const model = useProviderStore.getState().models[0];
    if (!model) throw new Error("no model");
    await useProviderStore.getState().upsertModel({ ...model, parameters: { temperature: 0.5 } });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, defaultPreset: "custom", autoTitle: false, autoRetry: false } });

    const responses = [new Response('{"error":{"message":"Unsupported parameter: temperature"}}', { status: 400 }), sseResponse([delta("OK"), done])];
    vi.stubGlobal("fetch", async () => responses.shift());
    await sendMessage("Hi");

    await vi.waitFor(() => expect(useProviderStore.getState().models[0]?.unsupportedParams).toContain("temperature"));
  });
});

describe("message actions", () => {
  it("regenerate shows a new answer and keeps the old one as a version", async () => {
    respondWith("First answer", "Better answer");
    await sendMessage("Hi");
    const first = useChatStore.getState().messages.at(-1)?.id ?? "";
    await regenerate(first);

    const { messages, forks, activeId } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages.at(-1)?.content).toBe("Better answer");
    expect(await getStorage().messagesFor(activeId ?? "")).toHaveLength(3);
    expect(forks[first]).toHaveLength(2);

    await switchBranch(first);
    expect(useChatStore.getState().messages.at(-1)?.content).toBe("First answer");
  });

  it("edit adds a new version of the message and answers it", async () => {
    const { bodies } = respondWith("First", "Second");
    await sendMessage("Original");
    await editMessage(useChatStore.getState().messages[0]?.id ?? "", "Edited");

    const { messages } = useChatStore.getState();
    expect(messages.map((message) => message.content)).toEqual(["Edited", "Second"]);
    expect(JSON.stringify(bodies[1])).toContain("Edited");
  });

  it("continue appends to the same message, using an instruction and no prefill", async () => {
    const { bodies } = respondWith("Start ", "and finish");
    await sendMessage("Hi");
    await continueMessage(useChatStore.getState().messages.at(-1)?.id ?? "");

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages.at(-1)?.content).toBe("Start and finish");

    const sent = bodies[1]?.messages as { role: string; content: string }[];
    expect(sent.at(-1)).toEqual({ role: "user", content: CONTINUE_INSTRUCTION });
  });

  it("delete removes a message from the store and the database", async () => {
    respondWith("Answer");
    await sendMessage("Hi");
    const { messages, activeId } = useChatStore.getState();
    await deleteMessage(messages.at(-1)?.id ?? "");

    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(await getStorage().messagesFor(activeId ?? "")).toHaveLength(1);
  });
});

describe("conversation management", () => {
  async function chat(): Promise<string> {
    respondWith("Answer");
    await sendMessage("Hello");
    return useChatStore.getState().activeId ?? "";
  }

  it("renames", async () => {
    const id = await chat();
    await useChatStore.getState().updateConversation(id, { title: "Renamed", titleSource: "user" });
    expect((await getStorage().get("conversations", id))?.title).toBe("Renamed");
  });

  it("deletes a chat with its messages", async () => {
    const id = await chat();
    await useChatStore.getState().deleteConversation(id);

    expect(useChatStore.getState().conversations).toEqual([]);
    expect(useChatStore.getState().activeId).toBeNull();
    expect(await getStorage().messagesFor(id)).toEqual([]);
  });

  it("duplicates a chat with independent messages", async () => {
    const id = await chat();
    await useChatStore.getState().duplicateConversation(id);

    const { conversations, activeId } = useChatStore.getState();
    expect(conversations).toHaveLength(2);
    expect(activeId).not.toBe(id);
    expect(await getStorage().messagesFor(activeId ?? "")).toHaveLength(2);
    expect(await getStorage().messagesFor(id)).toHaveLength(2);
  });

  it("reopens a chat from storage", async () => {
    const id = await chat();
    useChatStore.getState().newChat();
    expect(useChatStore.getState().messages).toEqual([]);

    await useChatStore.getState().openConversation(id);
    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it("recovers a response cut off by a page reload", async () => {
    const id = await chat();
    const stored = await getStorage().messagesFor(id);
    const last = stored.at(-1);
    if (last) await getStorage().put("messages", { ...last, status: "streaming" });

    useChatStore.getState().newChat();
    await useChatStore.getState().openConversation(id);
    expect(useChatStore.getState().messages.at(-1)?.status).toBe("stopped");
  });

  it("deleting a folder keeps its chats", async () => {
    const id = await chat();
    const folder = await useChatStore.getState().createFolder("Work");
    await useChatStore.getState().updateConversation(id, { folderId: folder.id });
    await useChatStore.getState().deleteFolder(folder.id);

    expect(useChatStore.getState().folders).toEqual([]);
    expect(useChatStore.getState().conversations[0]?.folderId).toBeUndefined();
  });

  it("falls back to another model when a chat's model was deleted", () => {
    const conversation = { modelConfigId: "gone" } as Conversation;
    expect(resolveModel(conversation).model?.modelId).toBe("test-model");
  });
});

describe("sidebar grouping", () => {
  const at = (time: number): Conversation => ({ updatedAt: time }) as Conversation;
  const now = new Date(2026, 10, 7, 12);
  const day = 86_400_000;

  it("groups by recency", () => {
    const groups = groupByDate([at(now.getTime()), at(now.getTime() - day), at(now.getTime() - 3 * day), at(now.getTime() - 30 * day)], now);
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "Previous 7 days", "Older"]);
  });

  it("omits empty groups", () => {
    expect(groupByDate([at(now.getTime())], now).map((group) => group.label)).toEqual(["Today"]);
  });
});

describe("streaming Markdown blocks", () => {
  it("splits on blank lines", () => {
    expect(splitMarkdownBlocks("One\n\nTwo")).toEqual(["One", "Two"]);
  });

  it("never splits inside a code fence", () => {
    expect(splitMarkdownBlocks("```js\na\n\nb\n```\n\nAfter")).toEqual(["```js\na\n\nb\n```", "After"]);
  });

  it("keeps an unclosed fence together while it streams", () => {
    expect(splitMarkdownBlocks("```js\na\n\nb")).toEqual(["```js\na\n\nb"]);
  });

  it("never splits a math block", () => {
    expect(splitMarkdownBlocks("$$\na\n\nb\n$$")).toHaveLength(1);
  });

  it("keeps a loose list together so numbering survives", () => {
    expect(splitMarkdownBlocks("1. a\n\n2. b\n\nAfter")).toEqual(["1. a\n\n2. b", "After"]);
  });

  it("keeps finished blocks identical as text streams in", () => {
    const first = splitMarkdownBlocks("Para one\n\nPara t");
    const second = splitMarkdownBlocks("Para one\n\nPara two is longer");
    expect(first[0]).toBe(second[0]);
  });
});

describe("math detection", () => {
  it("finds math", () => {
    expect(hasMath("Energy is $E = mc^2$ here")).toBe(true);
    expect(hasMath("\\(x\\)")).toBe(true);
    expect(hasMath("$$x$$")).toBe(true);
  });

  it("ignores prices and code", () => {
    expect(hasMath("It costs $5 and then $10")).toBe(false);
    expect(hasMath("`\\(x\\)`")).toBe(false);
    expect(hasMath("```\n$x$\n```")).toBe(false);
  });

  it("converts delimiters outside code only", () => {
    expect(normalizeMathDelimiters("\\(x\\)")).toBe("$x$");
    expect(normalizeMathDelimiters("\\[x\\]")).toBe("$$x$$");
    expect(normalizeMathDelimiters("`\\(x\\)`")).toBe("`\\(x\\)`");
  });
});
