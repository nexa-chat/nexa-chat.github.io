"use client";

import { ListPlus, Plus, Star } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { capabilityLabels } from "@/lib/capabilities";
import type { ModelConfig } from "@/types";
import { useProviderStore } from "../providers/provider-store";
import { useSettingsStore } from "../settings/settings-store";
import { useUiStore } from "../shell/ui-store";
import { BulkAddDialog } from "./bulk-add-dialog";
import { ModelEditor } from "./model-editor";
import { t } from "@/i18n";

function ModelRow({ model, onEdit }: { model: ModelConfig; onEdit: () => void }) {
  const providerName = useProviderStore((state) => state.providers.find((item) => item.id === model.providerId)?.name);
  const toggleFavorite = useProviderStore((state) => state.toggleFavoriteModel);
  const removeModel = useProviderStore((state) => state.removeModel);
  const defaultModelId = useSettingsStore((state) => state.settings.defaultModelId);
  const updateSettings = useSettingsStore((state) => state.update);
  const isDefault = defaultModelId === model.id;
  const labels = capabilityLabels(model.capabilities);

  const remove = async (): Promise<void> => {
    const confirmed = await confirmAction({ title: t("Delete {0}?", { 0: model.name }), message: t("Chats that used it stay, and will use your default model."), confirmLabel: t("Delete model"), danger: true });
    if (confirmed) {
      await removeModel(model.id);
      if (isDefault) updateSettings({ defaultModelId: undefined });
      toast.success(t("Model deleted."));
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex items-center gap-2">
          <span className="truncate font-medium">{model.name}</span>
          {isDefault ? <span className="shrink-0 rounded-sm bg-accent-soft px-1.5 text-xs font-medium text-accent">{t("Default")}</span> : null}
        </p>
        <p className="truncate text-[0.8125rem] text-muted">{providerName}</p>
        <p className="truncate font-mono text-xs text-faint">{model.modelId}</p>
        {labels.length > 0 ? <p className="mt-1 text-xs text-muted">{labels.join(" · ")}</p> : null}
      </div>
      <div className="flex items-center gap-1.5">
        <IconButton size="s" label={model.favorite ? t("Remove from favorites") : t("Add to favorites")} aria-pressed={model.favorite} onClick={() => void toggleFavorite(model.id)}>
          <Star className={`size-3.5 ${model.favorite ? "text-warning" : ""}`} fill={model.favorite ? "currentColor" : "none"} />
        </IconButton>
        {isDefault ? null : (
          <Button size="s" onClick={() => updateSettings({ defaultModelId: model.id })}>
            {t("Set default")}</Button>
        )}
        <Button size="s" onClick={onEdit}>
          {t("Edit")}</Button>
        <Button size="s" variant="danger" className="ml-3" onClick={() => void remove()}>
          {t("Delete")}</Button>
      </div>
    </li>
  );
}

export function ModelManager() {
  const models = useProviderStore((state) => state.models);
  const hasProviders = useProviderStore((state) => state.providers.length > 0);
  const openWizard = useUiStore((state) => state.openWizard);
  const [editing, setEditing] = useState<{ open: boolean; model?: ModelConfig }>({ open: false });
  const [bulk, setBulk] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t("My models")}</h2>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!hasProviders} onClick={() => setBulk(true)}>
            <ListPlus />
            {t("Add from list")}</Button>
          <Button variant="primary" disabled={!hasProviders} onClick={() => setEditing({ open: true })}>
            <Plus />
            {t("Add model")}</Button>
        </div>
      </div>

      {models.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong px-6 py-10 text-center">
          <p className="font-medium">{t("No models yet")}</p>
          <p className="mt-1 text-sm text-muted">{hasProviders ? t("Add a model from one of your providers.") : t("Add a provider first. Its model appears here.")}</p>
          {hasProviders ? null : (
            <Button className="mt-4" onClick={() => openWizard()}>
              {t("Add provider")}</Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {models.map((model) => (
            <ModelRow key={model.id} model={model} onEdit={() => setEditing({ open: true, model })} />
          ))}
        </ul>
      )}

      <ModelEditor open={editing.open} model={editing.model} onClose={() => setEditing({ open: false })} />
      {bulk ? <BulkAddDialog open onClose={() => setBulk(false)} /> : null}
    </div>
  );
}
