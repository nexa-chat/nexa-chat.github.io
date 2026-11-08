import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateTokens, formatCost } from "@/lib/params";
import { detectLocalServers } from "@/services/local-servers";
import { summarizeUsage } from "@/services/usage";
import type { Message } from "@/types";

function answer(id: string, createdAt: Date, patch: Partial<Message> = {}): Message {
  return {
    id,
    conversationId: "c",
    role: "assistant",
    content: "Hi",
    status: "complete",
    model: { modelConfigId: "m1", modelName: "Model One", providerName: "Acme" },
    usage: { inputTokens: 100, outputTokens: 50 },
    createdAt: createdAt.getTime(),
    updatedAt: createdAt.getTime(),
    ...patch,
  };
}

const now = new Date(2026, 10, 15);

describe("summarizeUsage", () => {
  const messages = [
    answer("a", new Date(2026, 10, 2), { estimatedCost: 0.01 }),
    answer("b", new Date(2026, 10, 3), { estimatedCost: 0.02, usage: { totalTokens: 400 } }),
    answer("c", new Date(2026, 9, 30), { estimatedCost: 1 }),
    answer("d", new Date(2026, 10, 4), { model: { modelConfigId: "m2", modelName: "Model Two", providerName: "Acme" } }),
    { ...answer("u", new Date(2026, 10, 4)), role: "user" as const },
  ];

  it("counts only this month's answers for the month", () => {
    const { totals } = summarizeUsage(messages, "month", now);
    expect(totals.answers).toBe(3);
    expect(totals.tokens).toBe(150 + 400 + 150);
    expect(totals.cost).toBeCloseTo(0.03);
    expect(totals.unpriced).toBe(1);
  });

  it("counts every answer for all time, and ignores the user's messages", () => {
    expect(summarizeUsage(messages, "all", now).totals.answers).toBe(4);
  });

  it("groups by model, most tokens first", () => {
    const { byModel } = summarizeUsage(messages, "month", now);
    expect(byModel.map((row) => row.model)).toEqual(["Model One", "Model Two"]);
    expect(byModel[1]?.cost).toBeUndefined();
  });

  it("leaves the cost unknown rather than zero when nothing had prices", () => {
    expect(summarizeUsage([answer("x", now)], "month", now).totals.cost).toBeUndefined();
  });
});

describe("estimates", () => {
  it("counts about four characters per token", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(9)).toBe(3);
  });

  it("keeps small costs readable", () => {
    expect(formatCost(0.0012)).toBe("~$0.0012");
    expect(formatCost(1.5)).toBe("~$1.50");
  });
});

describe("detectLocalServers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tells a ready server, a server refusing this site, and no server apart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("11434")) return new Response(JSON.stringify({ data: [{ id: "llama3.2" }, { id: "qwen3" }] }), { status: 200 });
        // LM Studio answers, but only to an opaque request: CORS refuses this origin.
        if (init?.mode === "no-cors") return new Response(null, { status: 200 });
        throw new TypeError("Failed to fetch");
      }),
    );
    const [ollama, lmstudio] = await detectLocalServers();
    expect(ollama).toMatchObject({ presetId: "ollama", status: "ready", models: ["llama3.2", "qwen3"] });
    expect(lmstudio).toMatchObject({ presetId: "lmstudio", status: "blocked" });
  });

  it("reports nothing found when no server answers at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect((await detectLocalServers()).map((server) => server.status)).toEqual(["absent", "absent"]);
  });
});
