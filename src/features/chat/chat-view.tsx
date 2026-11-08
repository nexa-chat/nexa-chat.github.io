"use client";

import { Folder as FolderIcon, Menu as MenuIcon, MoreHorizontal, SlidersHorizontal, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { useActiveContext } from "@/hooks/use-active-model";
import { Composer } from "../composer/composer";
import { useUiStore } from "../shell/ui-store";
import { useChatStore } from "./chat-store";
import { ConversationActionsMenu } from "./conversation-actions-menu";
import { EmptyState } from "./empty-state";
import { InstructionsDialog } from "./instructions-dialog";
import { MessageList } from "./message-list";
import { PreviewPanel } from "../preview/preview-panel";
import { LongChatNotice } from "./long-chat-notice";
import { PinnedBar } from "./pinned-bar";
import { StreamProgress } from "./stream-progress";
import { t } from "@/i18n";

function TitleEditor({ title, onDone }: { title: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(title);
  return (
    <input
      autoFocus
      aria-label={t("Chat title")}
      value={value}
      maxLength={80}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => onDone(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone(value);
        if (event.key === "Escape") onDone(null);
      }}
      className="h-8 w-full min-w-0 rounded-sm border border-accent bg-background-deep px-2 text-sm outline-none"
    />
  );
}

function ChatHeader() {
  const { conversation } = useActiveContext();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setInstructionsOpen = useUiStore((state) => state.setInstructionsOpen);
  const updateConversation = useChatStore((state) => state.updateConversation);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const finishRename = (value: string | null): void => {
    setRenaming(false);
    const title = value?.trim();
    if (conversation && title && title !== conversation.title) {
      void updateConversation(conversation.id, { title, titleSource: "user" });
    }
  };

  const customInstructions = conversation ? conversation.systemPreset !== "default" : false;
  const project = useChatStore((state) => state.folders.find((folder) => folder.id === conversation?.folderId));

  const title = conversation?.title;
  useEffect(() => {
    document.title = title ? `${title} · NEXA` : "NEXA";
  }, [title]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 px-2 sm:px-3">
      {conversation ? <h1 className="sr-only">{conversation.title}</h1> : null}
      <IconButton label={t("Open sidebar")} className="md:hidden" onClick={toggleSidebar}>
        <MenuIcon className="size-5" />
      </IconButton>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
        {project ? (
          <span className="flex max-w-[40%] shrink-0 items-center gap-1 rounded-[0.625rem] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-2 py-0.5 text-xs text-muted max-sm:hidden" title={t("In project {0}", { 0: project.name })}>
            <FolderIcon className="size-3" aria-hidden="true" />
            <span className="truncate">{project.name}</span>
          </span>
        ) : null}
        {conversation ? (
          renaming ? (
            <TitleEditor title={conversation.title} onDone={finishRename} />
          ) : (
            <>
              <button type="button" onClick={() => setRenaming(true)} title={t("Rename")} className="min-w-0 truncate rounded-[0.625rem] px-1.5 font-display text-[0.9375rem] font-semibold max-sm:py-3 [@media(hover:hover)]:hover:bg-surface-hover">
                {conversation.title}
              </button>
              {conversation.favorite ? <Star className="size-3.5 shrink-0 text-warning" fill="currentColor" aria-label={t("Favorite")} /> : null}
            </>
          )
        ) : null}
      </div>

      <IconButton label={t("System instructions")} active={customInstructions} onClick={() => setInstructionsOpen(true)}>
        <SlidersHorizontal className="size-4" />
      </IconButton>
      {conversation ? (
        <>
          <IconButton ref={menuButton} label={t("Chat actions")} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <MoreHorizontal className="size-[1.125rem]" />
          </IconButton>
          <ConversationActionsMenu conversation={conversation} open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuButton} onRename={() => setRenaming(true)} />
        </>
      ) : null}
    </header>
  );
}

function LoadingMessages() {
  return (
    <div aria-hidden="true" className="mx-auto flex w-full max-w-[var(--reading-width)] flex-1 flex-col gap-4 px-6 pt-8">
      <div className="skeleton ml-auto h-9 w-1/2" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-5/6" />
      <div className="skeleton h-4 w-2/3" />
    </div>
  );
}

export function ChatView() {
  const activeId = useChatStore((state) => state.activeId);
  const hasMessages = useChatStore((state) => state.messages.length > 0);
  const loading = useChatStore((state) => state.messagesLoading);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <ChatHeader />
        {hasMessages && !loading ? <PinnedBar /> : null}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <StreamProgress />
          {loading ? <LoadingMessages /> : hasMessages ? <MessageList key={activeId} /> : <EmptyState />}
        </div>
        {hasMessages && !loading ? <LongChatNotice /> : null}
        <Composer />
        <InstructionsDialog />
      </div>
      {/* Generated HTML, SVG and diagrams render here, beside the chat. */}
      <PreviewPanel />
    </div>
  );
}
