"use client";

import { Check, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { toNexaError } from "@/lib/errors";
import type { RemoteModel } from "@/providers";
import { createAdapter, modelFromRemote } from "@/services/provider-service";
import { useProviderStore } from "../providers/provider-store";
import { t, tn } from "@/i18n";

type ListState = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; models: RemoteModel[] };

/** Fetches a provider's model list and adds several models in one go. */
export function BulkAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const providers = useProviderStore((state) => state.providers);
  const existing = useProviderStore((state) => state.models);
  const upsertModel = useProviderStore((state) => state.upsertModel);

  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [list, setList] = useState<ListState>({ phase: "loading" });
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const provider = providers.find((item) => item.id === providerId);
  const added = useMemo(() => new Set(existing.filter((model) => model.providerId === providerId).map((model) => model.modelId)), [existing, providerId]);

  useEffect(() => {
    if (!open || !provider) return;
    let cancelled = false;
    void (async () => {
      try {
        const models = await (await createAdapter(provider)).listModels();
        if (!cancelled) setList({ phase: "ready", models: [...models].sort((a, b) => a.id.localeCompare(b.id)) });
      } catch (caught) {
        const error = toNexaError(caught);
        if (!cancelled) setList({ phase: "error", message: `${error.title}. This provider may not publish a model list: add models one by one instead.` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, provider]);

  const visible = useMemo(() => {
    if (list.phase !== "ready") return [];
    const needle = query.trim().toLowerCase();
    return list.models.filter((model) => !needle || `${model.id} ${model.name ?? ""}`.toLowerCase().includes(needle));
  }, [list, query]);

  const toggle = (id: string): void =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const choosable = visible.filter((model) => !added.has(model.id));
  const allShownPicked = choosable.length > 0 && choosable.every((model) => picked.has(model.id));

  const save = async (): Promise<void> => {
    if (!provider || list.phase !== "ready") return;
    setSaving(true);
    const chosen = list.models.filter((model) => picked.has(model.id));
    for (const remote of chosen) await upsertModel(modelFromRemote(provider.id, provider.apiType, remote.id, remote));
    setSaving(false);
    toast.success(tn(chosen.length, "{count} model added.", "{count} models added."));
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("Add models")}
      description={t("Pick from your provider's list. Add one by one for anything it doesn't list.")}
      footer={
        <>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={picked.size === 0 || saving} onClick={() => void save()}>
            {saving ? <LoaderCircle className="animate-spin" /> : null}
            {picked.size > 0 ? tn(picked.size, "Add {count} model", "Add {count} models") : t("Add models")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {providers.length > 1 ? (
          <Field label={t("Provider")} htmlFor="bulk-provider">
            <Select
              id="bulk-provider"
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value);
                setList({ phase: "loading" });
                setPicked(new Set());
              }}
            >
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {list.phase === "loading" ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t("Fetching the models of {0}…", { 0: provider?.name ?? t("the provider") })}</p>
        ) : null}
        {list.phase === "error" ? <p className="rounded-md bg-danger-soft px-3 py-2.5 text-sm">{list.message}</p> : null}

        {list.phase === "ready" ? (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" aria-hidden="true" />
                <Input type="search" aria-label={t("Filter models")} placeholder={t("Filter {0} models", { 0: list.models.length })} value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" />
              </div>
              <Button
                size="s"
                disabled={choosable.length === 0}
                onClick={() =>
                  setPicked((current) => {
                    const next = new Set(current);
                    for (const model of choosable) {
                      if (allShownPicked) next.delete(model.id);
                      else next.add(model.id);
                    }
                    return next;
                  })
                }
              >
                {allShownPicked ? t("Clear shown") : t("Select shown")}
              </Button>
            </div>
            <ul className="max-h-[min(22rem,45dvh)] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {visible.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">{t("No models match.")}</li> : null}
              {visible.map((model) => {
                const already = added.has(model.id);
                const checked = already || picked.has(model.id);
                return (
                  <li key={model.id}>
                    <label className={`flex items-center gap-3 px-3 py-2 touch:min-h-11 ${already ? "opacity-60" : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]"}`}>
                      <input type="checkbox" className="peer sr-only" checked={checked} disabled={already} onChange={() => toggle(model.id)} />
                      <span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${checked ? "border-accent bg-accent text-on-accent" : "border-border-strong"}`}>
                        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[0.8125rem]">{model.id}</span>
                        {model.name && model.name !== model.id ? <span className="block truncate text-xs text-muted">{model.name}</span> : null}
                      </span>
                      {already ? <span className="shrink-0 text-xs text-faint">{t("Added")}</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
