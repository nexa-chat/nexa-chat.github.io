"use client";

import { Bot, Download, Layers, MessageSquare, Moon, PanelLeft, Plus, Search, Server, Settings, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { hasFilters, searchChats, type ChatHit, type SearchFilters } from "@/services/search";
import { useChatStore } from "../chat/chat-store";
import { useProviderStore } from "../providers/provider-store";
import { useSettingsStore } from "../settings/settings-store";
import { useUiStore } from "../shell/ui-store";
import { useSelectModel } from "../composer/model-selector";
import { t } from "@/i18n";

interface Command {
  id: string;
  group: "Actions" | "Chats" | "Models" | "Providers";
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

function useActions(): Command[] {
  const router = useRouter();
  const openWizard = useUiStore((state) => state.openWizard);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const theme = useSettingsStore((state) => state.settings.theme);
  const update = useSettingsStore((state) => state.update);

  return useMemo(
    () => [
      {
        id: "new",
        group: "Actions",
        label: t("New chat"),
        hint: t("Alt N"),
        icon: Plus,
        run: () => {
          useChatStore.getState().newChat();
          router.push("/chat");
        },
      },
      { id: "add-provider", group: "Actions", label: t("Add provider"), icon: Server, run: () => openWizard() },
      { id: "change-model", group: "Actions", label: t("Change model"), icon: Layers, run: () => useUiStore.getState().openPalette("search") },
      { id: "settings", group: "Actions", label: t("Open settings"), icon: Settings, run: () => router.push("/settings/general") },
      { id: "sidebar", group: "Actions", label: t("Toggle sidebar"), icon: PanelLeft, run: toggleSidebar },
      { id: "export", group: "Actions", label: t("Export data"), icon: Download, run: () => router.push("/settings/data") },
      {
        id: "theme",
        group: "Actions",
        label: theme === "dark" ? t("Switch to light mode") : t("Switch to dark mode"),
        icon: Moon,
        run: () => update({ theme: theme === "dark" ? "light" : "dark" }),
      },
    ],
    [router, openWizard, toggleSidebar, theme, update],
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const mode = useUiStore((state) => state.paletteMode);
  const conversations = useChatStore((state) => state.conversations);
  const models = useProviderStore((state) => state.models);
  const providers = useProviderStore((state) => state.providers);
  const openWizard = useUiStore((state) => state.openWizard);
  const selectModel = useSelectModel();
  const router = useRouter();
  const actions = useActions();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChatHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filters, setFilters] = useState<SearchFilters>({});
  const filtering = hasFilters(filters);
  const list = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    void searchChats(query, conversations, { providers, models }, filtering ? 30 : 12, filters).then((result) => {
      if (!cancelled) setHits(result);
    });
    return () => {
      cancelled = true;
    };
  }, [query, conversations, providers, models, filters, filtering]);

  const commands = useMemo<Command[]>(() => {
    const matches = (text: string): boolean => !needle || text.toLowerCase().includes(needle);
    const openChat = (id: string): void => {
      void useChatStore.getState().openConversation(id);
      router.push(`/chat?c=${encodeURIComponent(id)}`);
    };

    const actionList = actions.filter((action) => matches(action.label));
    if (mode === "actions" && !needle && !filtering) return actionList;

    const chats: Command[] = needle || filtering
      ? hits.map((hit) => ({ id: `chat-${hit.conversationId}`, group: "Chats", label: hit.title, hint: hit.snippet, icon: MessageSquare, run: () => openChat(hit.conversationId) }))
      : conversations.slice(0, 6).map((item) => ({ id: `chat-${item.id}`, group: "Chats", label: item.title, icon: MessageSquare, run: () => openChat(item.id) }));

    const modelList: Command[] = models
      .filter((model) => matches(`${model.name} ${model.modelId}`))
      .slice(0, 6)
      .map((model) => ({
        id: `model-${model.id}`,
        group: "Models",
        label: model.name,
        hint: providers.find((item) => item.id === model.providerId)?.name,
        icon: Bot,
        run: () => selectModel(model),
      }));

    const providerList: Command[] = providers
      .filter((provider) => matches(provider.name))
      .slice(0, 4)
      .map((provider) => ({ id: `provider-${provider.id}`, group: "Providers", label: provider.name, icon: Server, run: () => openWizard(provider.id) }));

    // Filters narrow chats, so the other groups step aside.
    if (filtering) return chats;
    return [...actionList, ...chats, ...modelList, ...providerList];
  }, [actions, conversations, hits, mode, models, needle, openWizard, providers, router, selectModel, filtering]);

  const selected = Math.min(activeIndex, Math.max(0, commands.length - 1));

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const execute = (command: Command | undefined): void => {
    if (!command) return;
    if (command.id !== "change-model") onClose();
    command.run();
    if (command.id === "change-model") setQuery("");
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((selected + 1) % Math.max(1, commands.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((selected - 1 + commands.length) % Math.max(1, commands.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      execute(commands[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-faint" aria-hidden="true" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={commands[selected] ? `palette-${commands[selected].id}` : undefined}
          aria-label={t("Search anything")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          placeholder={t("Search anything…")}
          className="h-12 w-full bg-transparent text-[0.9375rem] outline-none"
        />
      </div>

      {mode === "search" || needle || filtering ? (
        <div role="group" aria-label={t("Filters")} className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          <button
            type="button"
            aria-pressed={Boolean(filters.savedOnly)}
            onClick={() => {
              setFilters((current) => ({ ...current, savedOnly: !current.savedOnly }));
              setActiveIndex(0);
            }}
            className={`rounded-[0.625rem] border px-2.5 py-1 text-xs touch:min-h-11 ${filters.savedOnly ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground"}`}
          >
            {t("Saved answers")}</button>
          <select
            aria-label={t("Period")}
            value={filters.withinDays ?? 0}
            onChange={(event) => {
              const days = Number(event.target.value);
              setFilters((current) => ({ ...current, withinDays: days || undefined }));
              setActiveIndex(0);
            }}
            className="rounded-[0.625rem] border border-border bg-transparent px-2 py-1 text-xs text-muted touch:min-h-11"
          >
            <option value={0}>{t("Any time")}</option>
            <option value={1}>{t("Today")}</option>
            <option value={7}>{t("Last 7 days")}</option>
            <option value={30}>{t("Last 30 days")}</option>
          </select>
          {models.length > 1 ? (
            <select
              aria-label={t("Model")}
              value={filters.modelId ?? ""}
              onChange={(event) => {
                setFilters((current) => ({ ...current, modelId: event.target.value || undefined }));
                setActiveIndex(0);
              }}
              className="max-w-44 rounded-[0.625rem] border border-border bg-transparent px-2 py-1 text-xs text-muted touch:min-h-11"
            >
              <option value="">{t("Any model")}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          ) : null}
          {filtering ? (
            <button type="button" onClick={() => setFilters({})} className="ml-auto px-1 text-xs text-muted underline underline-offset-2 hover:text-foreground touch:min-h-11">
              {t("Clear")}</button>
          ) : null}
        </div>
      ) : null}

      <div ref={list} id="palette-list" role="listbox" aria-label={t("Results")} className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5">
        {commands.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted">{query ? <>{t("No results for “")}{query}&rdquo;.</> : t("Nothing matches these filters.")}</p> : null}
        {commands.map((command, index) => {
          const showGroup = commands[index - 1]?.group !== command.group;
          const Icon = command.icon;
          return (
            <div key={command.id}>
              {showGroup ? <p className="px-2.5 pt-2 pb-1 text-xs text-faint">{command.group}</p> : null}
              <button
                id={`palette-${command.id}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === selected}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => execute(command)}
                className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm ${index === selected ? "bg-surface-hover ring-1 ring-accent ring-inset" : ""}`}
              >
                <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.hint ? <span className="max-w-[45%] shrink-0 truncate text-xs text-faint">{command.hint}</span> : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Opens with no animation: it's used too often for motion to be anything but a delay. */
export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const close = useUiStore((state) => state.closePalette);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-label={t("Command palette")}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
      className="mx-auto mt-[12dvh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-lg border border-border bg-surface-raised p-0 shadow-float"
    >
      {open ? <PaletteBody onClose={close} /> : null}
    </dialog>
  );
}
