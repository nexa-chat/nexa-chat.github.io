"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { inferCapabilities, prettifyModelName } from "@/lib/capabilities";
import { toNexaError } from "@/lib/errors";
import { GENERATION_PRESETS } from "@/lib/params";
import type { RemoteModel } from "@/providers";
import { createAdapter, modelFromRemote } from "@/services/provider-service";
import type { GenerationParams, ModelCapabilities, ModelConfig, ModelPricing } from "@/types";
import { ModelPicker } from "../providers/model-picker";
import { useProviderStore } from "../providers/provider-store";
import { t } from "@/i18n";

const CAPABILITY_FIELDS: { key: keyof ModelCapabilities; label: string; description: string }[] = [
  { key: "supportsVision", label: "Vision", description: "Can read images you attach" },
  { key: "supportsTools", label: "Tools", description: "Can call functions" },
  { key: "supportsReasoning", label: "Reasoning", description: "Can think before answering" },
  { key: "supportsFiles", label: "Files", description: "Reads PDFs natively" },
  { key: "supportsStreaming", label: "Streaming", description: "Sends the answer as it's written" },
];

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() === "" || !Number.isFinite(parsed) ? undefined : parsed;
}

function NumberField({ id, label, value, onChange, step, hint }: { id: string; label: string; value: number | undefined; onChange: (value: number | undefined) => void; step: string; hint?: string }) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input id={id} type="number" min="0" step={step} inputMode="decimal" placeholder={t("Provider default")} className="tabular" value={value ?? ""} onChange={(event) => onChange(numberOrUndefined(event.target.value))} />
    </Field>
  );
}

function EditorForm({ model, onClose }: { model?: ModelConfig; onClose: () => void }) {
  const providers = useProviderStore((state) => state.providers);
  const upsertModel = useProviderStore((state) => state.upsertModel);

  const [providerId, setProviderId] = useState(model?.providerId ?? providers[0]?.id ?? "");
  const [modelId, setModelId] = useState(model?.modelId ?? "");
  const [name, setName] = useState(model?.name ?? "");
  const [endpoint, setEndpoint] = useState(model?.endpoint ?? "");
  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(model?.capabilities ?? null);
  const [parameters, setParameters] = useState<GenerationParams>(model?.parameters ?? {});
  const [pricing, setPricing] = useState<ModelPricing>(model?.pricing ?? {});

  const provider = providers.find((item) => item.id === providerId);
  const effectiveCapabilities = capabilities ?? inferCapabilities(provider?.apiType ?? "openai", modelId);

  const setParam = (patch: Partial<GenerationParams>): void => setParameters((current) => ({ ...current, ...patch }));

  const loadModels = async (): Promise<RemoteModel[]> => {
    if (!provider) return [];
    try {
      return await (await createAdapter(provider)).listModels();
    } catch (caught) {
      throw new Error(t("{0}. You can still type the model ID.", { 0: t(toNexaError(caught).title) }));
    }
  };

  const onPick = (value: string, remote?: RemoteModel): void => {
    setModelId(value);
    if (!remote) return;
    setName(remote.name ?? prettifyModelName(value));
    if (remote.capabilities) setCapabilities({ ...inferCapabilities(provider?.apiType ?? "openai", value), ...remote.capabilities });
    if (remote.pricing) setPricing(remote.pricing);
  };

  const save = async (): Promise<void> => {
    if (!provider) return;
    const trimmed = modelId.trim();
    const base = model ?? modelFromRemote(providerId, provider.apiType, trimmed);
    await upsertModel({
      ...base,
      providerId,
      modelId: trimmed,
      name: name.trim() || prettifyModelName(trimmed),
      endpoint: endpoint.trim() || undefined,
      capabilities: effectiveCapabilities,
      parameters,
      pricing,
      // A new model ID starts with a clean slate.
      unsupportedParams: model?.modelId === trimmed ? model.unsupportedParams : [],
      updatedAt: Date.now(),
    });
    toast.success(t("Model saved."));
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Provider")} htmlFor="model-provider">
          <Select id="model-provider" value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Display name")} htmlFor="model-name">
          <Input id="model-name" value={name} placeholder={modelId ? prettifyModelName(modelId) : t("Claude Opus")} onChange={(event) => setName(event.target.value)} />
        </Field>
      </div>

      <Field label={t("Model ID")} htmlFor="model-id">
        <ModelPicker id="model-id" value={modelId} onChange={onPick} loadModels={loadModels} />
      </Field>

      <Field label={t("Endpoint for this model")} htmlFor="model-endpoint" hint={t("Optional. A path or full URL that replaces the provider's chat endpoint for this model.")}>
        <Input id="model-endpoint" spellCheck={false} placeholder="/deployments/my-model/chat" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} className="font-mono" />
      </Field>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-[0.8125rem] font-medium">{t("Capabilities")}</legend>
        {CAPABILITY_FIELDS.map((field) => (
          <Switch
            key={field.key}
            label={t(field.label)}
            description={t(field.description)}
            checked={effectiveCapabilities[field.key]}
            onChange={(checked) => {
              const next = { ...effectiveCapabilities, [field.key]: checked };
              if (field.key === "supportsVision") next.supportsImages = checked;
              setCapabilities(next);
            }}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium">{t("Parameters")}</legend>
        <p className="mb-3 text-[0.8125rem] text-muted">
          {t("Max tokens always applies. The rest apply when a chat uses the")}{" "}{GENERATION_PRESETS.find((preset) => preset.id === "custom")?.label} {t("preset. Empty fields aren't sent.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField id="p-temp" label={t("Temperature")} step="0.1" value={parameters.temperature} onChange={(temperature) => setParam({ temperature })} />
          <NumberField id="p-max" label={t("Max tokens")} step="1" value={parameters.maxTokens} onChange={(maxTokens) => setParam({ maxTokens })} />
          <NumberField id="p-top" label={t("Top P")} step="0.05" value={parameters.topP} onChange={(topP) => setParam({ topP })} />
          <NumberField id="p-freq" label={t("Frequency penalty")} step="0.1" value={parameters.frequencyPenalty} onChange={(frequencyPenalty) => setParam({ frequencyPenalty })} />
          <NumberField id="p-pres" label={t("Presence penalty")} step="0.1" value={parameters.presencePenalty} onChange={(presencePenalty) => setParam({ presencePenalty })} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium">{t("Prices")}</legend>
        <p className="mb-3 text-[0.8125rem] text-muted">{t("Optional. Used to estimate the cost of each response, on this device only.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField id="c-in" label={t("Input, per 1M tokens")} step="0.01" value={pricing.inputPerMTok} onChange={(inputPerMTok) => setPricing((current) => ({ ...current, inputPerMTok }))} />
          <NumberField id="c-out" label={t("Output, per 1M tokens")} step="0.01" value={pricing.outputPerMTok} onChange={(outputPerMTok) => setPricing((current) => ({ ...current, outputPerMTok }))} />
        </div>
      </fieldset>

      {model && model.unsupportedParams.length > 0 ? (
        <p className="text-[0.8125rem] text-muted">
          {t("Not sent to this model because it rejected them:")}{" "}<span className="font-mono text-xs">{model.unsupportedParams.join(", ")}</span>
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("Cancel")}</Button>
        <Button variant="primary" disabled={!modelId.trim() || !provider} onClick={() => void save()}>
          {t("Save model")}</Button>
      </div>
    </div>
  );
}

export function ModelEditor({ open, model, onClose }: { open: boolean; model?: ModelConfig; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={model ? t("Edit model") : t("Add model")} size="m">
      {open ? <EditorForm key={model?.id ?? "new"} model={model} onClose={onClose} /> : null}
    </Dialog>
  );
}
