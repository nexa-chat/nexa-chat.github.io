"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/menu";
import { useIsMobile } from "@/hooks/use-media-query";
import type { RemoteModel } from "@/providers";
import { t } from "@/i18n";

interface ModelPickerProps {
  id: string;
  value: string;
  onChange: (value: string, remote?: RemoteModel) => void;
  /** Fetches the provider's list. It throws a readable message on failure. */
  loadModels: () => Promise<RemoteModel[]>;
  placeholder?: string;
}

/** A plain text field, so any model ID works, with the provider's list one click away. */
export function ModelPicker({ id, value, onChange, loadModels, placeholder }: ModelPickerProps) {
  const [models, setModels] = useState<RemoteModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const mobile = useIsMobile();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (models ?? []).filter((model) => !needle || `${model.id} ${model.name ?? ""}`.toLowerCase().includes(needle)).slice(0, 200);
  }, [models, query]);

  const fetchList = async (): Promise<void> => {
    if (models) {
      setOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await loadModels();
      setModels(list);
      if (list.length === 0) setError("This provider returned no models. Type the ID instead.");
      else setOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("The model list couldn't be loaded. Type the ID instead."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <Input id={id} spellCheck={false} autoComplete="off" value={value} placeholder={placeholder ?? "anthropic/claude-opus-4-7"} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 font-mono" />
        <Button ref={button} onClick={() => void fetchList()} disabled={loading} className="h-10 max-sm:px-2.5">
          {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <ChevronDown className="size-3.5" />}
          {t("Browse")}</Button>
      </div>
      {error ? <p className="text-[0.8125rem] text-muted">{error}</p> : null}

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={button} width={340} label={t("Provider's models")}>
        <input autoFocus={!mobile} aria-label={t("Filter models")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Filter")} className="h-10 w-full shrink-0 border-b border-border bg-transparent px-3 text-sm outline-none" />
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {visible.length === 0 ? <p className="px-3 py-5 text-center text-sm text-muted">{t("No models match.")}</p> : null}
          {visible.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                onChange(model.id, model);
                setOpen(false);
                button.current?.focus();
              }}
              className="block w-full rounded-sm px-2.5 py-1.5 text-left touch:py-3 [@media(hover:hover)]:hover:bg-surface-hover"
            >
              <span className="block truncate font-mono text-[0.8125rem]">{model.id}</span>
              {model.name && model.name !== model.id ? <span className="block truncate text-xs text-muted">{model.name}</span> : null}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
