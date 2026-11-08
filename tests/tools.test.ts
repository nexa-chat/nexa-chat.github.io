import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "@/features/chat/chat-actions";
import { useChatStore } from "@/features/chat/chat-store";
import { answerApproval, useApprovalStore } from "@/features/chat/tool-approvals";
import { useProviderStore } from "@/features/providers/provider-store";
import { useSettingsStore } from "@/features/settings/settings-store";
import { buildChatMessages } from "@/services/context";
import { CalculatorError, calculate } from "@/services/tools/calculator";
import { modelFromRemote, saveProvider } from "@/services/provider-service";
import { MemoryStorage, getStorage, setStorageForTesting } from "@/storage";
import { DEFAULT_SETTINGS, type Message } from "@/types";
import { sseResponse } from "./helpers";

describe("calculate", () => {
  it("follows precedence, powers and functions", () => {
    expect(calculate("2 + 3 * 4")).toBe(14);
    expect(calculate("(12.5 * 4) ^ 2 / sqrt(16)")).toBe(625);
    expect(calculate("2 ^ 3 ^ 2")).toBe(512);
    expect(calculate("-(-3) + round(2.345, 2)")).toBeCloseTo(5.35);
    expect(calculate("max(1, 7, 3) % 4")).toBe(3);
    expect(calculate("1,000 × 2")).toBe(2000);
  });

  it("refuses anything that isn't arithmetic", () => {
    expect(() => calculate("alert(1)")).toThrow(CalculatorError);
    expect(() => calculate("constructor.constructor('x')()")).toThrow(CalculatorError);
    expect(() => calculate("1 / 0")).toThrow("Division by zero.");
    expect(() => calculate("2 +")).toThrow(CalculatorError);
  });
});

describe("buildChatMessages with tools", () => {
  const base = { conversationId: "c", status: "complete" as const, createdAt: 1, updatedAt: 1 };
  const capabilities = { supportsVision: false, supportsImages: false, supportsTools: true, supportsReasoning: false, supportsFiles: false, supportsStreaming: true };
  const adapter = { supportsFeature: () => false };

  it("sends calls with their results", async () => {
    const messages: Message[] = [
      { ...base, id: "u", role: "user", content: "6*7?" },
      { ...base, id: "a", role: "assistant", content: "", toolCalls: [{ id: "call1", name: "nexa__calculator", arguments: '{"expression":"6*7"}' }] },
      { ...base, id: "t", role: "tool", content: "", toolResults: [{ toolCallId: "call1", content: "42" }] },
    ];
    const built = await buildChatMessages(messages, capabilities, adapter);
    expect(built.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(built[1]?.toolCalls?.[0]?.id).toBe("call1");
    expect(built[2]?.toolResult?.content).toBe("42");
  });

  it("drops a call that never got a result, which providers would reject", async () => {
    const messages: Message[] = [
      { ...base, id: "u", role: "user", content: "Hi" },
      { ...base, id: "a", role: "assistant", content: "Let me check.", toolCalls: [{ id: "lost", name: "x", arguments: "{}" }] },
    ];
    const built = await buildChatMessages(messages, capabilities, adapter);
    expect(built[1]?.toolCalls).toBeUndefined();
    expect(built[1]?.parts).toEqual([{ type: "text", text: "Let me check." }]);
  });
});

describe("the tool loop", () => {
  const toolCall = (name: string, args: string): string =>
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name, arguments: args } }] } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`;
  const text = (content: string): string => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;
  let bodies: { messages: { role: string; content?: string }[]; tools?: unknown[] }[];

  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    setStorageForTesting(new MemoryStorage());
    useChatStore.setState({ conversations: [], folders: [], activeId: null, messages: [], streams: {}, draftModelId: undefined });
    const provider = await saveProvider({ name: "Keryos", apiType: "openai", baseUrl: "https://api.example.com/v1", headers: [], advanced: {}, connection: "direct", apiKey: "sk-test-key-123456", secretHeaders: {} });
    const model = modelFromRemote(provider.id, "openai", "gpt-tools");
    await getStorage().put("models", model);
    useProviderStore.setState({ providers: [provider], models: [model], loaded: true });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, autoTitle: false, autoRetry: false, toolsEnabled: true } });

    bodies = [];
    vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as (typeof bodies)[number];
      bodies.push(body);
      return sseResponse([body.messages.at(-1)?.role === "tool" ? text(`Result: ${body.messages.at(-1)?.content}`) : toolCall("nexa__calculator", '{"expression":"6*7"}')]);
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("runs a built-in tool without asking, and continues with its result", async () => {
    await sendMessage("What is 6*7?");
    const { messages } = useChatStore.getState();
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(messages[2]?.toolResults?.[0]?.content).toBe("42");
    expect(messages.at(-1)?.content).toBe("Result: 42");
    expect(bodies[0]?.tools?.length).toBe(2);
  });

  it("offers no tools while tools are off", async () => {
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, toolsEnabled: false } });
    vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as (typeof bodies)[number]);
      return sseResponse([text("Plain answer")]);
    });
    await sendMessage("Hi");
    expect(bodies[0]?.tools).toBeUndefined();
  });

  it("waits for approval before a server's tool, and tells the model when it is denied", async () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, mcpServers: [{ id: "s1", name: "Docs", url: "https://mcp.example.com/mcp", enabled: true, hasAuth: false }] },
    });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { method?: string; id?: number; messages?: { role: string; content?: string }[] };
      if (url.startsWith("https://mcp.example.com")) {
        if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "content-type": "application/json", "mcp-session-id": "abc" } });
        if (body.method === "tools/list") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "search", description: "Search docs", inputSchema: { type: "object" } }] } }), { headers: { "content-type": "application/json" } });
        return new Response(null, { status: 202 });
      }
      const last = body.messages?.at(-1);
      return sseResponse([last?.role === "tool" ? text(`Heard: ${last.content}`) : toolCall("docs__search", '{"q":"x"}')]);
    });

    const sending = sendMessage("Search the docs");
    for (let tries = 0; tries < 50 && Object.keys(useApprovalStore.getState().pending).length === 0; tries++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(Object.keys(useApprovalStore.getState().pending)).toEqual(["call_1"]);
    answerApproval("call_1", "deny");
    await sending;

    expect(useChatStore.getState().messages.at(-1)?.content).toBe("Heard: The user declined to run this tool.");
  });
});
