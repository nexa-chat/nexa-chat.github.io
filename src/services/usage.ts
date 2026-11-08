import type { Message } from "@/types";

export interface UsageTotals {
  answers: number;
  tokens: number;
  /** Sum of the answers that had prices. Undefined when none did. */
  cost?: number;
  /** Answers whose model had no prices, so their cost is unknown. */
  unpriced: number;
}

export interface ModelUsage extends UsageTotals {
  key: string;
  model: string;
  provider: string;
}

export interface UsageSummary {
  totals: UsageTotals;
  byModel: ModelUsage[];
}

export type UsagePeriod = "month" | "all";

function tokensOf(message: Message): number {
  const usage = message.usage;
  if (!usage) return 0;
  return usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}

function add(totals: UsageTotals, message: Message): void {
  totals.answers += 1;
  totals.tokens += tokensOf(message);
  if (message.estimatedCost === undefined) totals.unpriced += 1;
  else totals.cost = (totals.cost ?? 0) + message.estimatedCost;
}

function empty(): UsageTotals {
  return { answers: 0, tokens: 0, unpriced: 0 };
}

/** Totals from the answers stored in this browser. Nothing is fetched: costs use the prices you entered. */
export function summarizeUsage(messages: readonly Message[], period: UsagePeriod, now = new Date()): UsageSummary {
  const start = period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : 0;
  const totals = empty();
  const byModel = new Map<string, ModelUsage>();

  for (const message of messages) {
    if (message.role !== "assistant" || message.createdAt < start) continue;
    if (message.status !== "complete" && message.status !== "stopped" && !message.usage) continue;
    add(totals, message);
    const model = message.model?.modelName ?? "Unknown model";
    const provider = message.model?.providerName ?? "";
    const key = `${provider}\u0000${model}`;
    const row = byModel.get(key) ?? { key, model, provider, ...empty() };
    add(row, message);
    byModel.set(key, row);
  }

  return { totals, byModel: [...byModel.values()].sort((a, b) => b.tokens - a.tokens || b.answers - a.answers) };
}
