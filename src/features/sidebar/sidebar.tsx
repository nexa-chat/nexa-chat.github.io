"use client";

import { Archive, ArrowDownAZ, Clock, Folder as FolderIcon, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Star, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createElement, memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { LogoMark } from "@/components/brand/logo";
import { IconButton } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { Sidebar, SidebarBadge, SidebarFooter, SidebarHeader, SidebarItem, SidebarLabel, SidebarNav, SidebarNested, SidebarSection, SidebarToggle, useSidebar } from "@/components/ui/sidebar";
import { useSettingsStore } from "../settings/settings-store";
import type { Conversation, Folder } from "@/types";
import { useChatStore } from "../chat/chat-store";
import { ConversationActionsMenu } from "../chat/conversation-actions-menu";
import { useUiStore } from "../shell/ui-store";
import { ProjectDialog } from "../projects/project-dialog";
import { chatIcon } from "./chat-icon";
import { groupByDate } from "./group-conversations";
import { t } from "@/i18n";

function useOpenChat(): (id: string | null) => void {
  const router = useRouter();
  const pathname = usePathname();
  return (id) => {
    const chat = useChatStore.getState();
    if (id) void chat.openConversation(id);
    else chat.newChat();
    useUiStore.getState().setDrawerOpen(false);
    if (!pathname.startsWith("/chat")) router.push(id ? `/chat?c=${encodeURIComponent(id)}` : "/chat");
  };
}

const ConversationRow = memo(function ConversationRow({ conversation, active }: { conversation: Conversation; active: boolean }) {
  const openChat = useOpenChat();
  const updateConversation = useChatStore((state) => state.updateConversation);
  const streaming = useChatStore((state) => conversation.id in state.streams);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const menuButton = useRef<HTMLButtonElement>(null);
  // chatIcon returns one of a few fixed lucide components, never a new one.
  const icon = useMemo(() => createElement(chatIcon(conversation.title)), [conversation.title]);

  const finishRename = (): void => {
    setRenaming(false);
    const next = title.trim();
    if (next && next !== conversation.title) void updateConversation(conversation.id, { title: next, titleSource: "user" });
  };

  if (renaming) {
    return (
      <input
        autoFocus
        aria-label={t("Chat title")}
        value={title}
        maxLength={80}
        onChange={(event) => setTitle(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={finishRename}
        onKeyDown={(event) => {
          if (event.key === "Enter") finishRename();
          if (event.key === "Escape") setRenaming(false);
        }}
        className="h-8 w-full rounded-sm border border-accent bg-background px-2 text-sm outline-none"
      />
    );
  }

  return (
    <div className="group relative">
      <SidebarItem active={active} icon={icon} onClick={() => openChat(conversation.id)} className="pr-9 max-md:pr-12">
        <span className="flex min-w-0 items-center gap-1.5">
          {streaming ? <span className="size-1.5 shrink-0 rounded-full bg-accent" title={t("Generating")} /> : null}
          <span dir="auto" className="truncate leading-normal">
            {conversation.title}
          </span>
        </span>
      </SidebarItem>
      <IconButton
        ref={menuButton}
        size="s"
        label={t("Actions for {0}", { 0: conversation.title })}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className={`absolute top-1/2 right-0.5 z-20 -translate-y-1/2 ${menuOpen ? "opacity-100" : "focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"}`}
      >
        <MoreHorizontal className="size-4" />
      </IconButton>
      <ConversationActionsMenu
        conversation={conversation}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuButton}
        onRename={() => {
          setTitle(conversation.title);
          setRenaming(true);
        }}
      />
    </div>
  );
});

function FolderGroup({ folder, conversations, activeId }: { folder: Folder; conversations: Conversation[]; activeId: string | null }) {
  const deleteFolder = useChatStore((state) => state.deleteFolder);
  const [editing, setEditing] = useState(false);
  const openChat = useOpenChat();

  const remove = async (): Promise<void> => {
    const confirmed = await confirmAction({
      title: t("Delete \"{0}\"?", { 0: folder.name }),
      message: t("The chats inside stay in your list. Only the project, its instructions and its files go."),
      confirmLabel: t("Delete project"),
      danger: true,
    });
    if (confirmed) await deleteFolder(folder.id);
  };

  return (
    <SidebarNested icon={<FolderIcon />} label={folder.name} badge={conversations.length} defaultOpen>
      {conversations.map((conversation) => (
        <ConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeId} />
      ))}
      <div className="flex flex-wrap items-center gap-x-1">
        <button
          type="button"
          onClick={() => {
            openChat(null);
            useChatStore.getState().setDraft({ draftFolderId: folder.id });
          }}
          className="flex items-center gap-1.5 rounded-[0.625rem] px-3 py-1.5 text-xs text-muted touch:min-h-11 hover:text-foreground"
        >
          <Plus className="size-3" aria-hidden="true" />
          {t("New chat here")}</button>
        <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-[0.625rem] px-3 py-1.5 text-xs text-muted touch:min-h-11 hover:text-foreground">
          <Settings className="size-3" aria-hidden="true" />
          {t("Project")}</button>
        <button type="button" onClick={() => void remove()} className="flex items-center gap-1.5 rounded-[0.625rem] px-3 py-1.5 text-xs text-faint touch:min-h-11 hover:text-danger">
          <X className="size-3" aria-hidden="true" />
          {t("Delete")}</button>
      </div>
      {editing ? <ProjectDialog folder={folder} onClose={() => setEditing(false)} /> : null}
    </SidebarNested>
  );
}

function NewFolderInput({ onDone }: { onDone: () => void }) {
  const createFolder = useChatStore((state) => state.createFolder);
  const [name, setName] = useState("");
  const finish = (): void => {
    if (name.trim()) void createFolder(name);
    onDone();
  };
  return (
    <input
      autoFocus
      aria-label={t("Project name")}
      placeholder={t("Project name")}
      value={name}
      onChange={(event) => setName(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish();
        if (event.key === "Escape") onDone();
      }}
      className="h-8 w-full rounded-sm border border-accent bg-background px-2 text-sm outline-none"
    />
  );
}

type DatedRow = { kind: "label"; label: string; first: boolean } | { kind: "chat"; conversation: Conversation };

/**
 * Only the rows near the viewport exist, so 5,000 chats cost what 30 do. Favorites and folders
 * above stay ordinary: they are short, and their groups animate.
 */
function DatedChats({ groups, activeId, scrollRef, sortAction, above }: { groups: { label: string; items: Conversation[] }[]; activeId: string | null; scrollRef: RefObject<HTMLDivElement | null>; sortAction: React.ReactNode; above: number }) {
  const size = useSettingsStore((state) => state.settings.sidebarSize);
  const rows = useMemo<DatedRow[]>(
    () => groups.flatMap((group, index) => [{ kind: "label" as const, label: group.label, first: index === 0 }, ...group.items.map((conversation) => ({ kind: "chat" as const, conversation }))]),
    [groups],
  );
  const list = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  // Where the list starts inside the scroller. It moves when favorites come and go, or rows resize.
  useLayoutEffect(() => {
    setOffset(list.current?.offsetTop ?? 0);
  }, [above, size]);

  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer owns its own subscription
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === "label" ? 30 : 32),
    overscan: 12,
    scrollMargin: offset,
    getItemKey: (index) => {
      const row = rows[index];
      return row?.kind === "chat" ? row.conversation.id : `label-${row?.label ?? index}`;
    },
  });

  return (
    <div ref={list} className="relative py-1" style={{ height: virtualizer.getTotalSize() + 8 }}>
      {virtualizer.getVirtualItems().map((item) => {
        const row = rows[item.index];
        if (!row) return null;
        return (
          <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="absolute inset-x-0 top-0 px-2" style={{ transform: `translateY(${item.start - offset}px)` }}>
            {row.kind === "label" ? (
              <SidebarLabel label={row.label} action={row.first ? sortAction : undefined} className={row.first ? "-mx-2" : "-mx-2 mt-1"} />
            ) : (
              <ConversationRow conversation={row.conversation} active={row.conversation.id === activeId} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConversationLists({ activeId, scrollRef }: { activeId: string | null; scrollRef: RefObject<HTMLDivElement | null> }) {
  const conversations = useChatStore((state) => state.conversations);
  const folders = useChatStore((state) => state.folders);
  const loaded = useChatStore((state) => state.loaded);
  const sort = useUiStore((state) => state.sidebarSort);
  const setSort = useUiStore((state) => state.setSidebarSort);
  const [addingFolder, setAddingFolder] = useState(false);

  const { favorites, groups, archived, byFolder } = useMemo(() => {
    const visible = conversations.filter((item) => !item.archived);
    const loose = visible.filter((item) => !item.folderId && !item.favorite);
    const sorted = sort === "name" ? [...loose].sort((a, b) => a.title.localeCompare(b.title)) : loose;
    return {
      favorites: visible.filter((item) => item.favorite),
      groups: sort === "name" ? [{ label: t("All chats"), items: sorted }] : groupByDate(sorted),
      archived: conversations.filter((item) => item.archived),
      byFolder: new Map(folders.map((folder) => [folder.id, visible.filter((item) => item.folderId === folder.id && !item.favorite)])),
    };
  }, [conversations, folders, sort]);

  if (!loaded) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-2 px-4 pt-2">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    );
  }

  return (
    <>
      {favorites.length > 0 ? (
        <SidebarSection label={t("Favorites")}>
          {favorites.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeId} />
          ))}
        </SidebarSection>
      ) : null}

      <DatedChats
        groups={groups}
        activeId={activeId}
        scrollRef={scrollRef}
        above={favorites.length}
        sortAction={
          <IconButton size="s" label={sort === "recent" ? t("Sort by name") : t("Sort by date")} onClick={() => setSort(sort === "recent" ? "name" : "recent")}>
            {sort === "recent" ? <ArrowDownAZ className="size-3.5" /> : <Clock className="size-3.5" />}
          </IconButton>
        }
      />

      {conversations.length === 0 ? <p className="px-[18px] py-4 text-sm text-faint">{t("No conversations yet.")}</p> : null}

      <SidebarSection
        label={t("Projects")}
        action={
          <IconButton size="s" label={t("New project")} onClick={() => setAddingFolder(true)}>
            <Plus className="size-3.5" />
          </IconButton>
        }
      >
        {folders.map((folder) => (
          <FolderGroup key={folder.id} folder={folder} conversations={byFolder.get(folder.id) ?? []} activeId={activeId} />
        ))}
        {addingFolder ? <NewFolderInput onDone={() => setAddingFolder(false)} /> : null}
      </SidebarSection>

      {archived.length > 0 ? (
        <SidebarSection>
          <SidebarNested icon={<Archive />} label={t("Archived")} badge={archived.length}>
            {archived.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeId} />
            ))}
          </SidebarNested>
        </SidebarSection>
      ) : null}
    </>
  );
}

/** The app's mark in the demo's workspace slot. */
function Brand() {
  const { collapsed } = useSidebar();
  const mark = (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-accent text-on-accent">
      <LogoMark size={14} />
    </span>
  );
  if (collapsed) return mark;
  return (
    <Link href="/" aria-label={t("NEXA home")} className="flex min-w-0 items-center gap-2.5 rounded-[0.625rem] outline-none focus-visible:ring-2 focus-visible:ring-accent touch:min-h-11">
      {mark}
      <span className="truncate font-display text-[13.5px] leading-none font-semibold tracking-[0.06em]">{t("NEXA")}</span>
    </Link>
  );
}

/** Where the demo shows the signed-in user: here there is no account, and that's the point. */
function LocalProfile({ onOpen, active }: { onOpen: () => void; active: boolean }) {
  const { collapsed } = useSidebar();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "page" : undefined}
      title={collapsed ? t("Local profile, no account") : undefined}
      aria-label={collapsed ? t("Local profile, no account") : undefined}
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[0.625rem] text-left outline-none focus-visible:ring-2 focus-visible:ring-accent touch:min-h-11"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
      </span>
      {collapsed ? null : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] leading-tight font-medium">{t("Local profile")}</span>
          <span className="block truncate text-[11px] leading-tight text-[var(--muted)]">{t("No account, stays on this device")}</span>
        </span>
      )}
    </button>
  );
}

/** A shortcut hint. Phones have no keyboard, so it hides there. */
function Shortcut({ keys }: { keys: string }) {
  return (
    <span className="max-md:hidden">
      <SidebarBadge>{keys}</SidebarBadge>
    </span>
  );
}

/** The parts that change with the rail, so they read the sidebar's real state. */
function SidebarBody({ mobile }: { mobile: boolean }) {
  const { collapsed } = useSidebar();
  const activeId = useChatStore((state) => state.activeId);
  const openPalette = useUiStore((state) => state.openPalette);
  const setDrawerOpen = useUiStore((state) => state.setDrawerOpen);
  const pathname = usePathname();
  const router = useRouter();
  const openChat = useOpenChat();
  const scroller = useRef<HTMLDivElement>(null);

  const go = (href: string): void => {
    setDrawerOpen(false);
    router.push(href);
  };

  return (
    <>
      <SidebarHeader>
        <Brand />
        {mobile ? <SidebarToggle className="ml-auto" collapsed={false} onToggle={() => setDrawerOpen(false)} /> : <SidebarToggle className="ml-auto" />}
      </SidebarHeader>

      <SidebarSection className="shrink-0 pt-0">
        <SidebarItem icon={<Plus />} badge={<Shortcut keys="Alt N" />} onClick={() => openChat(null)}>
          {t("New chat")}</SidebarItem>
        <SidebarItem
          icon={<Search />}
          badge={<Shortcut keys="Ctrl K" />}
          onClick={() => {
            setDrawerOpen(false);
            openPalette("search");
          }}
        >
          {t("Search")}</SidebarItem>
        <SidebarItem icon={<Star />} active={pathname === "/saved"} onClick={() => go("/saved")}>
          {t("Saved answers")}</SidebarItem>
        <SidebarItem icon={<Settings />} active={pathname.startsWith("/settings") && !pathname.endsWith("/privacy")} onClick={() => go("/settings/general")}>
          {t("Settings")}</SidebarItem>
      </SidebarSection>

      {collapsed ? <div className="flex-1" /> : <SidebarNav ref={scroller} className="relative border-t border-[var(--border)]">
          <ConversationLists activeId={pathname.startsWith("/chat") ? activeId : null} scrollRef={scroller} />
        </SidebarNav>}

      <SidebarFooter>
        <LocalProfile active={pathname.endsWith("/privacy")} onOpen={() => go("/settings/privacy")} />
      </SidebarFooter>
    </>
  );
}

export function AppSidebar({ mobile = false }: { mobile?: boolean }) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const setDrawerOpen = useUiStore((state) => state.setDrawerOpen);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const size = useSettingsStore((state) => state.settings.sidebarSize);

  return (
    <Sidebar
      aria-label={t("Conversations")}
      variant={mobile ? "default" : "collapsible"}
      collapsed={!sidebarOpen}
      onCollapsedChange={(collapsed) => (mobile ? setDrawerOpen(false) : setSidebarOpen(!collapsed))}
      width={mobile ? "100%" : (sidebarWidth ?? "var(--sidebar-width)")}
      resizable={!mobile}
      minWidth={200}
      maxWidth={480}
      onWidthChange={setSidebarWidth}
      size={size}
      className="pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <SidebarBody mobile={mobile} />
    </Sidebar>
  );
}
