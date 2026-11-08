import type { Conversation } from "@/types";
import { t } from "@/i18n";

export interface ConversationGroup {
  label: string;
  items: Conversation[];
}

const DAY_MS = 86_400_000;

export function groupByDate(conversations: readonly Conversation[], now = new Date()): ConversationGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups: ConversationGroup[] = [
    { label: t("Today"), items: [] },
    { label: t("Yesterday"), items: [] },
    { label: t("Previous 7 days"), items: [] },
    { label: t("Older"), items: [] },
  ];

  for (const conversation of conversations) {
    const time = conversation.updatedAt;
    const index = time >= startOfToday ? 0 : time >= startOfToday - DAY_MS ? 1 : time >= startOfToday - 7 * DAY_MS ? 2 : 3;
    groups[index]?.items.push(conversation);
  }
  return groups.filter((group) => group.items.length > 0);
}
