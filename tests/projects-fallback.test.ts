import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "@/features/chat/chat-actions";
import { useChatStore } from "@/features/chat/chat-store";
import { previewKind } from "@/features/preview/preview-store";
import { useProviderStore } from "@/features/providers/provider-store";
import { useSettingsStore } from "@/features/settings/settings-store";
import { composeSystem } from "@/services/context";
import { modelFromRemote, saveProvider } from "@/services/provider-service";
import { MemoryStorage, getStorage, setStorageForTesting } from "@/storage";
import { DEFAULT_SETTINGS, type Folder } from "@/types";
import { sseResponse } from "./helpers";

const delta = (content: string): string => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const done = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;

describe("composeSystem", () => {
  const project: Folder = {
    id: "f1",
    name: "My app",
    instructions: "Answer in French.",
    files: [{ id: "a1", name: "README.md", mimeType: "text/markdown", size: 10, kind: "text", extractedText: "Next.js app" }],
    createdAt: 0,
  };

  it("joins the chat's instructions, the project and the summary, in that order", () => {
    const system = composeSystem("Be brief.", project, { summary: "Earlier: we chose Postgres." }) ?? "";
    expect(system.indexOf("Be brief.")).toBe(0);
    expect(system).toContain('Project "My app" instructions:\nAnswer in French.');
    expect(system).toContain('<file name="README.md">\nNext.js app\n</file>');
    expect(system.indexOf("Earlier: we chose Postgres.")).toBeGreaterThan(system.indexOf("README.md"));
  });

  it("is undefined when there is nothing to say", () => {
    expect(composeSystem(undefined, undefined, {})).toBeUndefined();
    expect(composeSystem("  ", { id: "f", name: "Empty", createdAt: 0 }, {})).toBeUndefined();
  });
});

describe("previewKind", () => {
  it("previews HTML, SVG and Mermaid, and nothing else", () => {
    expect(previewKind("html", "<p>hi</p>")).toBe("html");
    expect(previewKind("xml", "<svg viewBox='0 0 1 1'></svg>")).toBe("svg");
    expect(previewKind("xml", "<note/>")).toBeUndefined();
    expect(previewKind("mermaid", "flowchart LR")).toBe("mermaid");
    expect(previewKind("typescript", "const a = 1")).toBeUndefined();
  });
});

describe("fallback", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    setStorageForTesting(new MemoryStorage());
    useChatStore.setState({ conversations: [], folders: [], activeId: null, messages: [], streams: {}, draftModelId: undefined });

    const provider = await saveProvider({ name: "Keryos", apiType: "openai", baseUrl: "https://api.example.com/v1", headers: [], advanced: {}, connection: "direct", apiKey: "sk-test-key-123456", secretHeaders: {} });
    const primary = modelFromRemote(provider.id, "openai", "broken-model");
    const backup = modelFromRemote(provider.id, "openai", "backup-model");
    await getStorage().putMany("models", [primary, backup]);
    useProviderStore.setState({ providers: [provider], models: [primary, backup], loaded: true });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, autoTitle: false, autoRetry: false, defaultModelId: primary.id, fallbackModelId: backup.id } });

    vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { model: string };
      if (body.model === "broken-model") return new Response(JSON.stringify({ error: { message: "Internal error" } }), { status: 500 });
      return sseResponse([delta("Backup answer"), done]);
    });
  });

  it("answers with the fallback model when the chosen one fails on the server", async () => {
    await sendMessage("Hi");
    const answer = useChatStore.getState().messages.at(-1);
    expect(answer?.status).toBe("complete");
    expect(answer?.content).toBe("Backup answer");
    expect(answer?.model?.modelName).toBe("Backup Model");
    expect(answer?.fellBackFrom?.modelName).toBe("Broken Model");
  });

  it("leaves the chat on the model the user chose", async () => {
    await sendMessage("Hi");
    const { conversations } = useChatStore.getState();
    expect(useProviderStore.getState().models.find((model) => model.id === conversations[0]?.modelConfigId)?.modelId).toBe("broken-model");
  });

  it("does nothing when no fallback is set", async () => {
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, fallbackModelId: undefined } });
    await sendMessage("Hi");
    expect(useChatStore.getState().messages.at(-1)?.status).toBe("error");
  });
});
