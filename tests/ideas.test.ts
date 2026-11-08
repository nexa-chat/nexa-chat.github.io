import { Code2, Languages, MessageSquare, Plane, Sigma } from "lucide-react";
import { beforeEach, describe, expect, it } from "vitest";
import { initialsOf } from "@/features/chat/model-avatar";
import { chatIcon } from "@/features/sidebar/chat-icon";
import { invalidateSearchIndex, searchChats } from "@/services/search";
import { chunkText, speakableText } from "@/services/speech";
import { fillTemplate, templateVariables } from "@/services/templates";
import { getStorage } from "@/storage";
import type { Conversation, Message } from "@/types";

describe("chatIcon", () => {
  it("reads the subject from the title, in English and French", () => {
    expect(chatIcon("Fix this TypeScript error")).toBe(Code2);
    expect(chatIcon("Voyage à Lisbonne")).toBe(Plane);
    expect(chatIcon("Résoudre une équation")).toBe(Sigma);
    expect(chatIcon("Traduire ce texte")).toBe(Languages);
  });

  it("falls back to a plain bubble", () => {
    expect(chatIcon("Hello there")).toBe(MessageSquare);
  });
});

describe("initialsOf", () => {
  it("takes the first letters of two words, or two letters of one", () => {
    expect(initialsOf("Mock GPT")).toBe("MG");
    expect(initialsOf("claude-opus-4")).toBe("CO");
    expect(initialsOf("Gemini")).toBe("GE");
    expect(initialsOf("—")).toBe("?");
  });
});

describe("templates", () => {
  it("lists each variable once, in order", () => {
    expect(templateVariables("Email {{ recipient }} about {{subject}}, cc {{recipient}}")).toEqual(["recipient", "subject"]);
    expect(templateVariables("No blanks here")).toEqual([]);
  });

  it("fills variables and drops the empty ones", () => {
    expect(fillTemplate("To {{who}} about {{what}}.", { who: "Jo" })).toBe("To Jo about .");
  });
});

describe("speech text", () => {
  it("skips code and markdown symbols", () => {
    expect(speakableText("# Title\n\nUse **bold** and `x`.\n\n```js\nlet a = 1;\n```")).toBe("Title Use bold and x. Code block skipped.");
  });

  it("splits long text at sentence ends", () => {
    const chunks = chunkText("One sentence here. ".repeat(30), 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
  });
});

describe("search filters", () => {
  const conversation = (id: string, title: string, modelConfigId?: string): Conversation => ({
    id,
    title,
    titleSource: "user",
    modelConfigId,
    systemPreset: "default",
    systemPrompt: "",
    preset: "balanced",
    favorite: false,
    archived: false,
    messageCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
  });
  const answer = (id: string, conversationId: string, content: string, patch: Partial<Message> = {}): Message => ({
    id,
    conversationId,
    role: "assistant",
    content,
    status: "complete",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...patch,
  });
  const chats = [conversation("c1", "Lisbon trip", "m1"), conversation("c2", "Rust help", "m2")];

  beforeEach(async () => {
    await getStorage().clear("messages");
    await getStorage().putMany("messages", [
      answer("a1", "c1", "Visit Belém", { saved: true, model: { modelConfigId: "m1", modelName: "One", providerName: "P" } }),
      answer("a2", "c2", "Use a Vec", { model: { modelConfigId: "m2", modelName: "Two", providerName: "P" }, createdAt: Date.now() - 40 * 86_400_000 }),
    ]);
    invalidateSearchIndex();
  });

  const context = { providers: [], models: [] };

  it("finds saved answers with no query at all", async () => {
    const hits = await searchChats("", chats, context, 30, { savedOnly: true });
    expect(hits.map((hit) => hit.conversationId)).toEqual(["c1"]);
  });

  it("keeps only one model's answers", async () => {
    const hits = await searchChats("", chats, context, 30, { modelId: "m2" });
    expect(hits.map((hit) => hit.conversationId)).toEqual(["c2"]);
  });

  it("drops what is older than the period", async () => {
    const hits = await searchChats("", chats, context, 30, { withinDays: 30 });
    expect(hits.map((hit) => hit.conversationId)).toEqual(["c1"]);
  });

  it("still needs a query or a filter", async () => {
    expect(await searchChats("", chats, context)).toEqual([]);
  });
});
