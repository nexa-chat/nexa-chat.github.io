"use client";

import { confirmAction } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { activePath } from "@/services/branches";
import { exportConversation, printConversation, type ExportFormat } from "@/services/export";
import type { Conversation } from "@/types";
import { readTree, useChatStore } from "./chat-store";
import { t } from "@/i18n";

export async function confirmDeleteConversation(conversation: Conversation): Promise<void> {
  const confirmed = await confirmAction({
    title: t("Delete this chat?"),
    message: t("\"{0}\" and its messages will be removed from this browser. This can't be undone.", { 0: conversation.title }),
    confirmLabel: t("Delete chat"),
    danger: true,
  });
  if (confirmed) {
    await useChatStore.getState().deleteConversation(conversation.id);
    toast.success(t("Chat deleted."));
  }
}

export async function exportChat(conversation: Conversation, format: ExportFormat | "pdf"): Promise<void> {
  const messages = activePath(await readTree(conversation.id), conversation.activeLeafId);
  if (format === "pdf") printConversation(conversation, messages);
  else exportConversation(conversation, messages, format);
}

export function toggleFavorite(conversation: Conversation): void {
  void useChatStore.getState().updateConversation(conversation.id, { favorite: !conversation.favorite });
}

export function toggleArchive(conversation: Conversation): void {
  const archived = !conversation.archived;
  void useChatStore.getState().updateConversation(conversation.id, { archived });
  toast.success(archived ? t("Chat archived.") : t("Chat restored."));
  if (archived && useChatStore.getState().activeId === conversation.id) useChatStore.getState().newChat();
}
