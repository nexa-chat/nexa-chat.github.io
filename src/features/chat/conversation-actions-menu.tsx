"use client";

import { Archive, ArchiveRestore, Copy, Download, FileDown, FolderInput, ListCollapse, Pencil, Printer, Share2, Star, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { Menu, type MenuItem } from "@/components/ui/menu";
import type { Conversation } from "@/types";
import { continueWithSummary } from "./chat-actions";
import { useChatStore } from "./chat-store";
import { confirmDeleteConversation, exportChat, toggleArchive, toggleFavorite } from "./conversation-menu";
import { t } from "@/i18n";

interface Props {
  conversation: Conversation;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onRename: () => void;
}

export function ConversationActionsMenu({ conversation, open, onClose, anchorRef, onRename }: Props) {
  const folders = useChatStore((state) => state.folders);
  const duplicate = useChatStore((state) => state.duplicateConversation);
  const update = useChatStore((state) => state.updateConversation);

  const items: MenuItem[] = [
    { id: "rename", label: t("Rename"), icon: <Pencil />, onSelect: onRename },
    { id: "favorite", label: conversation.favorite ? t("Remove favorite") : t("Favorite"), icon: <Star />, onSelect: () => toggleFavorite(conversation) },
    { id: "duplicate", label: t("Duplicate"), icon: <Copy />, onSelect: () => void duplicate(conversation.id) },
    { id: "summary", label: t("Continue from a summary"), icon: <ListCollapse />, onSelect: () => void continueWithSummary(conversation.id) },
    ...folders.map((folder, index) => ({
      id: `folder-${folder.id}`,
      label: conversation.folderId === folder.id ? t("Remove from {0}", { 0: folder.name }) : t("Move to {0}", { 0: folder.name }),
      icon: <FolderInput />,
      separated: index === 0,
      onSelect: () => void update(conversation.id, { folderId: conversation.folderId === folder.id ? undefined : folder.id }),
    })),
    { id: "md", label: t("Export Markdown"), icon: <Download />, separated: true, onSelect: () => void exportChat(conversation, "markdown") },
    { id: "json", label: t("Export JSON"), icon: <FileDown />, onSelect: () => void exportChat(conversation, "json") },
    { id: "txt", label: t("Export text"), icon: <FileDown />, onSelect: () => void exportChat(conversation, "txt") },
    { id: "pdf", label: t("Print or save as PDF"), icon: <Printer />, onSelect: () => void exportChat(conversation, "pdf") },
    { id: "share", label: t("Share as a file"), icon: <Share2 />, onSelect: () => void exportChat(conversation, "html") },
    {
      id: "archive",
      label: conversation.archived ? t("Restore") : t("Archive"),
      icon: conversation.archived ? <ArchiveRestore /> : <Archive />,
      separated: true,
      onSelect: () => toggleArchive(conversation),
    },
    { id: "delete", label: t("Delete"), icon: <Trash2 />, danger: true, separated: true, onSelect: () => void confirmDeleteConversation(conversation) },
  ];

  return <Menu open={open} onClose={onClose} anchorRef={anchorRef} items={items} label={t("Actions for {0}", { 0: conversation.title })} width={224} />;
}
