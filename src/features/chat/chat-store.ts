"use client";

import { create } from "zustand";
import { createId } from "@/lib/ids";
import { activePath, findForks, linkMessages, type Forks } from "@/services/branches";
import { invalidateSearchIndex } from "@/services/search";
import { getStorage } from "@/storage";
import type { Conversation, Folder, Message, PresetId, SystemPresetId } from "@/types";
import { useSettingsStore } from "../settings/settings-store";
import { t } from "@/i18n";
import { stripBase, withBase } from "@/lib/base-path";

export type StreamPhase = "connecting" | "streaming" | "retrying";

export interface StreamState {
  messageId: string;
  conversationId: string;
  text: string;
  reasoning: string;
  phase: StreamPhase;
  retryAttempt?: number;
}

interface ChatState {
  conversations: Conversation[];
  folders: Folder[];
  activeId: string | null;
  /** The branch on screen, oldest first. Other versions stay in storage. */
  messages: Message[];
  forks: Forks;
  /** Set while changing branch, because the reader is looking at the fork and not the end. */
  keepScroll: boolean;
  /** A message the list should scroll to, then clear. */
  jumpTarget: string | null;
  jumpTo: (messageId: string | null) => void;
  messagesLoading: boolean;
  /** Live generations, keyed by conversation. Only streaming rows subscribe to this. */
  streams: Record<string, StreamState>;
  /** The model picked before a new chat exists. */
  draftModelId?: string;
  draftPreset?: PresetId;
  draftSystemPreset?: SystemPresetId;
  draftSystemPrompt?: string;
  /** The project a new chat will belong to. */
  draftFolderId?: string;
  loaded: boolean;

  load: () => Promise<void>;
  newChat: () => void;
  openConversation: (id: string, options?: { replace?: boolean }) => Promise<void>;
  createConversation: (patch?: Partial<Conversation>) => Promise<Conversation>;
  updateConversation: (id: string, patch: Partial<Conversation>) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  duplicateConversation: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  updateFolder: (id: string, patch: Partial<Omit<Folder, "id" | "createdAt">>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  setDraft: (patch: Partial<Pick<ChatState, "draftModelId" | "draftPreset" | "draftSystemPreset" | "draftSystemPrompt" | "draftFolderId">>) => void;
  setMessages: (updater: (messages: Message[]) => Message[]) => void;
  refreshForks: (conversationId: string) => Promise<void>;
  setStream: (conversationId: string, stream: StreamState | null) => void;
}

/** Every message of a chat, across all branches, oldest first. */
export async function readTree(conversationId: string, liveMessageId?: string): Promise<Message[]> {
  const stored = await getStorage().messagesFor(conversationId);
  const linked = linkMessages(stored);
  const unlinked = linked.filter((message, index) => stored[index]?.parentId === undefined);
  if (unlinked.length > 0) await getStorage().putMany("messages", unlinked);
  // A "streaming" record with no live stream was cut off by a reload.
  return linked.map((message) => (message.status === "streaming" && message.id !== liveMessageId ? { ...message, status: "stopped" as const } : message));
}

function syncUrl(id: string | null, replace = false): void {
  if (typeof window === "undefined" || !stripBase(window.location.pathname).startsWith("/chat")) return;
  // Keep the trailing slash a static build uses, so the URL stays the one GitHub Pages serves.
  const page = window.location.pathname.endsWith("/") ? withBase("/chat/") : withBase("/chat");
  const url = id ? `${page}?c=${encodeURIComponent(id)}` : page;
  if (`${window.location.pathname}${window.location.search}` === url) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", url);
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  folders: [],
  activeId: null,
  messages: [],
  forks: {},
  keepScroll: false,
  jumpTarget: null,
  jumpTo: (jumpTarget) => set({ jumpTarget }),
  messagesLoading: false,
  streams: {},
  loaded: false,

  load: async () => {
    const storage = getStorage();
    const [conversations, folders] = await Promise.all([storage.getAll("conversations"), storage.getAll("folders")]);
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    folders.sort((a, b) => a.createdAt - b.createdAt);
    set({ conversations, folders, loaded: true });
  },

  newChat: () => {
    set({
      activeId: null,
      messages: [],
      forks: {},
      messagesLoading: false,
      draftModelId: undefined,
      draftPreset: undefined,
      draftSystemPreset: undefined,
      draftSystemPrompt: undefined,
      draftFolderId: undefined,
    });
    syncUrl(null);
  },

  openConversation: async (id, options) => {
    if (get().activeId === id && get().messages.length > 0) return;
    if (!get().conversations.some((conversation) => conversation.id === id)) {
      get().newChat();
      return;
    }
    set({ activeId: id, messagesLoading: true });
    syncUrl(id, options?.replace);

    const tree = await readTree(id, get().streams[id]?.messageId);
    if (get().activeId !== id) return;
    const leaf = get().conversations.find((conversation) => conversation.id === id)?.activeLeafId;
    set({ messages: activePath(tree, leaf), forks: findForks(tree), messagesLoading: false });
  },

  createConversation: async (patch = {}) => {
    const { draftModelId, draftPreset, draftSystemPreset, draftSystemPrompt, draftFolderId } = get();
    const { settings } = useSettingsStore.getState();
    const now = Date.now();
    const conversation: Conversation = {
      id: createId("cnv"),
      title: t("New chat"),
      titleSource: "pending",
      modelConfigId: draftModelId,
      folderId: draftFolderId,
      systemPreset: draftSystemPreset ?? "default",
      systemPrompt: draftSystemPrompt ?? "",
      preset: draftPreset ?? settings.defaultPreset,
      favorite: false,
      archived: false,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      metadata: {},
      ...patch,
    };
    await getStorage().put("conversations", conversation);
    set((state) => ({ conversations: [conversation, ...state.conversations], activeId: conversation.id, messages: [], forks: {} }));
    syncUrl(conversation.id);
    return conversation;
  },

  updateConversation: async (id, patch) => {
    const current = get().conversations.find((conversation) => conversation.id === id);
    if (!current) return;
    const updated = { ...current, ...patch };
    await getStorage().put("conversations", updated);
    set((state) => {
      const others = state.conversations.filter((conversation) => conversation.id !== id);
      const moved = updated.updatedAt !== current.updatedAt;
      return {
        conversations: moved ? [updated, ...others] : state.conversations.map((item) => (item.id === id ? updated : item)),
      };
    });
  },

  deleteConversation: async (id) => {
    const storage = getStorage();
    const messages = await storage.messagesFor(id);
    const attachmentIds = messages.flatMap((message) => message.attachments?.map((attachment) => attachment.id) ?? []);
    await storage.deleteMany("messages", messages.map((message) => message.id));
    await storage.deleteMany("blobs", attachmentIds);
    await storage.delete("conversations", id);
    invalidateSearchIndex();

    set((state) => ({ conversations: state.conversations.filter((conversation) => conversation.id !== id) }));
    if (get().activeId === id) get().newChat();
  },

  duplicateConversation: async (id) => {
    const storage = getStorage();
    const source = get().conversations.find((conversation) => conversation.id === id);
    if (!source) return;

    const now = Date.now();
    const messages = await readTree(id);
    const newIds = new Map(messages.map((message) => [message.id, createId("msg")]));
    const remap = (messageId: string | null | undefined): string | null => (messageId && newIds.get(messageId)) || null;
    const copy: Conversation = {
      ...source,
      id: createId("cnv"),
      title: `${source.title} (copy)`,
      titleSource: "user",
      favorite: false,
      activeLeafId: remap(source.activeLeafId) ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    await storage.put("conversations", copy);
    await storage.putMany(
      "messages",
      messages.map((message) => ({ ...message, id: newIds.get(message.id) ?? createId("msg"), parentId: remap(message.parentId), conversationId: copy.id })),
    );
    invalidateSearchIndex();
    set((state) => ({ conversations: [copy, ...state.conversations] }));
    await get().openConversation(copy.id);
  },

  createFolder: async (name) => {
    const folder: Folder = { id: createId("fld"), name: name.trim(), createdAt: Date.now() };
    await getStorage().put("folders", folder);
    set((state) => ({ folders: [...state.folders, folder] }));
    return folder;
  },

  updateFolder: async (id, patch) => {
    const folder = get().folders.find((item) => item.id === id);
    if (!folder) return;
    const updated = { ...folder, ...patch };
    await getStorage().put("folders", updated);
    set((state) => ({ folders: state.folders.map((item) => (item.id === id ? updated : item)) }));
  },

  renameFolder: async (id, name) => {
    const folder = get().folders.find((item) => item.id === id);
    if (!folder) return;
    const updated = { ...folder, name: name.trim() };
    await getStorage().put("folders", updated);
    set((state) => ({ folders: state.folders.map((item) => (item.id === id ? updated : item)) }));
  },

  deleteFolder: async (id) => {
    await getStorage().delete("folders", id);
    const inside = get().conversations.filter((conversation) => conversation.folderId === id);
    await Promise.all(inside.map((conversation) => get().updateConversation(conversation.id, { folderId: undefined })));
    set((state) => ({ folders: state.folders.filter((folder) => folder.id !== id) }));
  },

  setDraft: (patch) => set(patch),

  setMessages: (updater) => set((state) => ({ messages: updater(state.messages) })),

  refreshForks: async (conversationId) => {
    const forks = findForks(linkMessages(await getStorage().messagesFor(conversationId)));
    if (get().activeId === conversationId) set({ forks });
  },

  setStream: (conversationId, stream) =>
    set((state) => {
      const streams = { ...state.streams };
      if (stream) streams[conversationId] = stream;
      else delete streams[conversationId];
      return { streams };
    }),
}));
