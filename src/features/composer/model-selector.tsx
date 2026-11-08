"use client";

import { Check, ChevronDown, Search, Settings2, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { MorphingText } from "@/components/ui/ai-chat-input";
import { moveRadio } from "@/components/ui/field";
import { Popover } from "@/components/ui/menu";
import { useActiveContext } from "@/hooks/use-active-model";
import { useIsMobile } from "@/hooks/use-media-query";
import { capabilityLabels } from "@/lib/capabilities";
import { GENERATION_PRESETS } from "@/lib/params";
import type { ModelConfig, PresetId } from "@/types";
import { useChatStore } from "../chat/chat-store";
import { useProviderStore } from "../providers/provider-store";
import { useSettingsStore } from "../settings/settings-store";
import { t } from "@/i18n";

/** The response style of the current chat, or of the chat about to start. */
export function useGenerationPreset(): { presetId: PresetId; setPreset: (preset: PresetId) => void } {
  const { conversation } = useActiveContext();
  const updateConversation = useChatStore((state) => state.updateConversation);
  const draftPreset = useChatStore((state) => state.draftPreset);
  const setDraft = useChatStore((state) => state.setDraft);
  const defaultPreset = useSettingsStore((state) => state.settings.defaultPreset);

  return {
    presetId: conversation?.preset ?? draftPreset ?? defaultPreset,
    setPreset: (preset) => {
      if (conversation) void updateConversation(conversation.id, { preset });
      else setDraft({ draftPreset: preset });
    },
  };
}

export function useSelectModel(): (model: ModelConfig) => void {
  const { conversation } = useActiveContext();
  const updateConversation = useChatStore((state) => state.updateConversation);
  const setDraft = useChatStore((state) => state.setDraft);
  return (model) => {
    if (conversation) void updateConversation(conversation.id, { modelConfigId: model.id, providerId: model.providerId });
    else setDraft({ draftModelId: model.id });
  };
}

function ModelOption({ model, selected, onSelect, onFavorite }: { model: ModelConfig; selected: boolean; onSelect: () => void; onFavorite: () => void }) {
  const labels = capabilityLabels(model.capabilities);
  return (
    <div className="group flex items-center rounded-sm [@media(hover:hover)]:hover:bg-surface-hover">
      <button type="button" data-model-option aria-current={selected ? "true" : undefined} onClick={onSelect} className="min-w-0 flex-1 rounded-sm px-2.5 py-1.5 text-left touch:py-3">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{model.name}</span>
          {selected ? <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" /> : null}
        </span>
        {labels.length > 0 ? <span className="block truncate text-xs text-muted">{labels.join(" · ")}</span> : null}
      </button>
      <button
        type="button"
        aria-label={model.favorite ? t("Remove {0} from favorites", { 0: model.name }) : t("Add {0} to favorites", { 0: model.name })}
        aria-pressed={model.favorite}
        onClick={onFavorite}
        className={`mr-1 flex size-7 shrink-0 items-center justify-center rounded-sm transition-opacity duration-100 touch:size-11 [@media(hover:hover)]:hover:bg-surface ${
          model.favorite ? "text-warning" : "text-faint [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <Star className="size-3.5" fill={model.favorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

export function ModelSelector({ disabled }: { disabled?: boolean }) {
  const { model: active, provider } = useActiveContext();
  const models = useProviderStore((state) => state.models);
  const providers = useProviderStore((state) => state.providers);
  const toggleFavorite = useProviderStore((state) => state.toggleFavoriteModel);
  const { presetId, setPreset } = useGenerationPreset();
  const selectModel = useSelectModel();
  const mobile = useIsMobile();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  /** Arrows walk the models, and going up past the first one returns to the search field. */
  const moveFocus = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = [...(list.current?.querySelectorAll<HTMLElement>("[data-model-option]") ?? [])];
    const current = options.indexOf(document.activeElement as HTMLElement);
    const next = current + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) search.current?.focus();
    else options[Math.min(next, options.length - 1)]?.focus();
  };

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return providers
      .map((item) => ({
        provider: item,
        models: models
          .filter((model) => model.providerId === item.id)
          .filter((model) => !needle || `${model.name} ${model.modelId} ${item.name}`.toLowerCase().includes(needle))
          .sort((a, b) => Number(b.favorite) - Number(a.favorite)),
      }))
      .filter((group) => group.models.length > 0);
  }, [models, providers, query]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="press flex h-7 min-w-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted transition-colors duration-100 disabled:opacity-50 touch:h-11 [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-foreground"
      >
        <MorphingText text={active?.name ?? t("Select model")} className="max-w-[7.5rem] sm:max-w-[14rem]" />
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={trigger} width={320} label={t("Choose a model")}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-faint" aria-hidden="true" />
          <input
            ref={search}
            autoFocus={!mobile}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={moveFocus}
            placeholder={t("Search models")}
            aria-label={t("Search models")}
            className="h-10 w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div ref={list} role="group" aria-label={t("Models")} onKeyDown={moveFocus} className="min-h-0 flex-1 overflow-y-auto p-1">
          {groups.length === 0 ? <p className="px-2.5 py-6 text-center text-sm text-muted">{query ? t("No models match.") : t("No models yet.")}</p> : null}
          {groups.map((group) => (
            <div key={group.provider.id} className="mb-1 last:mb-0">
              <p className="truncate px-2.5 pt-1.5 pb-0.5 text-xs text-faint">{group.provider.name}</p>
              {group.models.map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  selected={model.id === active?.id && group.provider.id === provider?.id}
                  onSelect={() => {
                    selectModel(model);
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                  onFavorite={() => void toggleFavorite(model.id)}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="border-t border-border p-2">
          <div role="radiogroup" aria-label={t("Response style")} onKeyDown={moveRadio} className="flex flex-wrap gap-1">
            {GENERATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={preset.id === presetId}
                tabIndex={preset.id === presetId ? 0 : -1}
                title={t(preset.description)}
                onClick={() => setPreset(preset.id)}
                className={`press rounded-sm px-2 py-1 text-xs font-medium transition-colors duration-100 touch:px-2.5 touch:py-3 ${
                  preset.id === presetId ? "bg-accent-soft text-accent" : "text-muted [@media(hover:hover)]:hover:bg-surface-hover"
                }`}
              >
                {t(preset.label)}
              </button>
            ))}
          </div>
          <Link href="/settings/models" onClick={() => setOpen(false)} className="mt-1.5 flex items-center gap-2 rounded-sm px-2 py-1.5 text-[0.8125rem] text-muted [@media(hover:hover)]:hover:bg-surface-hover">
            <Settings2 className="size-3.5" aria-hidden="true" />
            {t("Manage models")}</Link>
        </div>
      </Popover>
    </>
  );
}
