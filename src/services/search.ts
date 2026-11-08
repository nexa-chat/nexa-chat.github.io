import { getStorage } from "@/storage";
import type { Conversation, ModelConfig, ProviderConfig } from "@/types";
import { isSaved } from "./branches";

export interface SearchFilters {
  /** Only answers from this model. */
  modelId?: string;
  /** Only what was written in the last this many days. */
  withinDays?: number;
  /** Only answers kept in saved answers. */
  savedOnly?: boolean;
}

export function hasFilters(filters: SearchFilters | undefined): boolean {
  return Boolean(filters && (filters.modelId || filters.withinDays || filters.savedOnly));
}

export interface ChatHit {
  conversationId: string;
  title: string;
  /** Text around the match when it was found inside a message. */
  snippet?: string;
}

interface IndexedMessage {
  conversationId: string;
  text: string;
  lower: string;
  modelId?: string;
  createdAt: number;
  saved: boolean;
}

let index: IndexedMessage[] | undefined;

/** Called after any message write. The index rebuilds on the next search. */
export function invalidateSearchIndex(): void {
  index = undefined;
}

async function loadIndex(): Promise<IndexedMessage[]> {
  if (!index) {
    const messages = await getStorage().getAll("messages");
    index = messages.map((message) => ({
      conversationId: message.conversationId,
      text: message.content,
      lower: message.content.toLowerCase(),
      modelId: message.model?.modelConfigId,
      createdAt: message.createdAt,
      saved: isSaved(message),
    }));
  }
  return index;
}

function snippetAround(text: string, position: number, length: number): string {
  const start = Math.max(0, position - 30);
  const end = Math.min(text.length, position + length + 70);
  const excerpt = text.slice(start, end).replace(/[`*_#>]+/g, "").replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < text.length ? "…" : ""}`;
}

export async function searchChats(
  query: string,
  conversations: readonly Conversation[],
  context: { providers: readonly ProviderConfig[]; models: readonly ModelConfig[] },
  limit = 30,
  filters: SearchFilters = {},
): Promise<ChatHit[]> {
  const needle = query.trim().toLowerCase();
  const filtering = hasFilters(filters);
  if (!needle && !filtering) return [];
  const since = filters.withinDays ? Date.now() - filters.withinDays * 86_400_000 : 0;

  const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const hits = new Map<string, ChatHit>();

  // A whole chat matches by title only when every filter can be judged on the chat itself.
  const chatLevel = (conversation: Conversation): boolean =>
    !filters.savedOnly && (!filters.modelId || conversation.modelConfigId === filters.modelId) && conversation.updatedAt >= since;

  for (const conversation of conversations) {
    if (needle && chatLevel(conversation) && conversation.title.toLowerCase().includes(needle)) {
      hits.set(conversation.id, { conversationId: conversation.id, title: conversation.title });
    }
  }

  const matchingModels = new Set(
    context.models
      .filter((model) => {
        const provider = context.providers.find((item) => item.id === model.providerId);
        return `${model.name} ${model.modelId} ${provider?.name ?? ""}`.toLowerCase().includes(needle);
      })
      .map((model) => model.id),
  );
  for (const conversation of conversations) {
    if (needle && chatLevel(conversation) && conversation.modelConfigId && matchingModels.has(conversation.modelConfigId) && !hits.has(conversation.id)) {
      hits.set(conversation.id, { conversationId: conversation.id, title: conversation.title });
    }
  }

  for (const entry of await loadIndex()) {
    if (hits.size >= limit) break;
    if (hits.has(entry.conversationId)) continue;
    if (filters.modelId && entry.modelId !== filters.modelId) continue;
    if (filters.savedOnly && !entry.saved) continue;
    if (entry.createdAt < since) continue;
    const position = needle ? entry.lower.indexOf(needle) : 0;
    const conversation = byId.get(entry.conversationId);
    if (position !== -1 && conversation && entry.text.trim()) {
      hits.set(entry.conversationId, {
        conversationId: entry.conversationId,
        title: conversation.title,
        snippet: snippetAround(entry.text, position, needle.length),
      });
    }
  }

  return [...hits.values()].slice(0, limit);
}
