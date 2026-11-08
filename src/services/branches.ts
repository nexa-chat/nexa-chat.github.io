import type { Message } from "@/types";

/** For each message that has other versions: all versions of it, oldest first. */
export type Forks = Record<string, readonly string[]>;

/**
 * A chat is a tree: each message points to the one it answers, and Retry or Edit adds a
 * sibling instead of overwriting. Chats saved before branches were flat lists, so a message
 * with no recorded parent simply follows the one before it.
 */
export function linkMessages(sorted: readonly Message[]): Message[] {
  return sorted.map((message, index) => (message.parentId === undefined ? { ...message, parentId: sorted[index - 1]?.id ?? null } : message));
}

/** The line of messages from the root to the leaf: what the reader sees and the model receives. */
export function activePath(linked: readonly Message[], leafId?: string): Message[] {
  const byId = new Map(linked.map((message) => [message.id, message]));
  const path: Message[] = [];
  const seen = new Set<string>();
  // With no chosen leaf the newest message wins, because new messages always join the active line.
  let current = (leafId ? byId.get(leafId) : undefined) ?? linked.at(-1);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Follows the newest reply down from a message, so opening a version shows where it ended up. */
export function deepestLeaf(linked: readonly Message[], messageId: string): string {
  const latestChild = new Map<string, string>();
  for (const message of linked) {
    if (message.parentId) latestChild.set(message.parentId, message.id);
  }
  const seen = new Set<string>();
  let current = messageId;
  for (let next = latestChild.get(current); next && !seen.has(next); next = latestChild.get(current)) {
    seen.add(next);
    current = next;
  }
  return current;
}

export function findForks(linked: readonly Message[]): Forks {
  const siblings = new Map<string, string[]>();
  for (const message of linked) {
    const key = message.parentId ?? "";
    siblings.set(key, [...(siblings.get(key) ?? []), message.id]);
  }
  const forks: Record<string, readonly string[]> = {};
  for (const ids of siblings.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) forks[id] = ids;
  }
  return forks;
}

/** Thumbs up from before saved answers existed count as saved. */
export function isSaved(message: Message): boolean {
  return message.saved ?? message.feedback === "good";
}
