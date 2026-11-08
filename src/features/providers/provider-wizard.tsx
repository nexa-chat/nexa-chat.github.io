"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Segmented, Switch } from "@/components/ui/field";
import { UrlText } from "@/components/ui/url-text";
import { toast } from "@/components/ui/toast";
import { useIsMobile } from "@/hooks/use-media-query";
import { NexaError, toNexaError } from "@/lib/errors";
import { providerRegistry, type RemoteModel } from "@/providers";
import { API_TYPE_LABELS, PROVIDER_PRESETS, findPreset, type ProviderPreset } from "@/providers/presets";
import { draftToConfig, healthFromResult, modelFromRemote, saveProvider, testDraft } from "@/services/provider-service";
import { getStorage, getVault } from "@/storage";
import type { ApiType } from "@/types";
import { useSettingsStore } from "../settings/settings-store";
import { useUiStore } from "../shell/ui-store";
import { AdvancedHttp } from "./advanced-http";
import { ApiKeyField } from "./api-key-field";
import { LocalDetect } from "./local-detect";
import { ModelPicker } from "./model-picker";
import { useProviderStore } from "./provider-store";
import { RelayChoice, TestPanel, type TestState } from "./test-panel";
import { useWizardForm, type WizardForm } from "./use-wizard-form";
import { t } from "@/i18n";

type Step = 1 | 2 | 3;
const STEP_TITLES: Record<Step, string> = { 1: "Provider", 2: "Connection", 3: "Test" };

function StepIndicator({ step }: { step: Step }) {
  return (
    <ol aria-label={t("Steps")} className="mb-4 flex items-center gap-2 text-[0.8125rem]">
      {([1, 2, 3] as const).map((value) => (
        <li key={value} aria-current={value === step ? "step" : undefined} className={`flex items-center gap-2 ${value === step ? "font-medium text-foreground" : "text-faint"}`}>
          {value > 1 ? <span aria-hidden="true" className={`h-px w-5 ${value <= step ? "bg-accent" : "bg-border-strong"}`} /> : null}
          {STEP_TITLES[value]}
        </li>
      ))}
    </ol>
  );
}

function ChooseProvider({ form, custom, onCustom, onPick }: { form: WizardForm; custom: boolean; onCustom: () => void; onPick: (preset: ProviderPreset, modelId?: string) => void }) {
  const { values } = form;
  const openAiCompatible = values.apiType === "openai";

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onCustom}
        aria-pressed={custom}
        className={`press flex items-center justify-between gap-3 rounded-md border px-3.5 py-3 text-left transition-colors duration-100 ${custom ? "border-accent bg-accent-soft" : "border-border-strong [@media(hover:hover)]:hover:bg-surface-hover"}`}
      >
        <span>
          <span className="block font-medium">{t("Custom API")}</span>
          <span className="block text-[0.8125rem] text-muted">{t("Any OpenAI-compatible, Anthropic-compatible or HTTP endpoint")}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>

      {custom ? (
        <div className="fade-in flex flex-col gap-3">
          <Field label={t("Provider name")} htmlFor="provider-name">
            <Input id="provider-name" autoFocus value={values.name} placeholder={t("Keryos")} onChange={(event) => form.update({ name: event.target.value })} />
          </Field>
          <Switch
            label={t("OpenAI-compatible API")}
            description={t("Most gateways and local servers are. You'll only need a base URL, a key and a model.")}
            checked={openAiCompatible}
            onChange={(checked) => form.update({ apiType: checked ? "openai" : "anthropic" })}
          />
          {openAiCompatible ? null : (
            <Field label={t("API type")}>
              <Segmented<ApiType>
                label={t("API type")}
                value={values.apiType}
                options={[
                  { value: "anthropic", label: API_TYPE_LABELS.anthropic },
                  { value: "custom-http", label: API_TYPE_LABELS["custom-http"] },
                ]}
                onChange={(apiType) => form.update({ apiType })}
              />
            </Field>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-2 text-[0.8125rem] text-muted">{t("Or start from a known provider")}</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPick(preset)}
                className="press rounded-md border border-border px-3 py-2.5 text-left text-sm font-medium transition-colors duration-100 [@media(hover:hover)]:hover:border-border-strong [@media(hover:hover)]:hover:bg-surface-hover"
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <LocalDetect onUse={onPick} />
          </div>
        </div>
      )}
    </div>
  );
}

interface ConnectionStepProps {
  form: WizardForm;
  providerId?: string;
  storedHint?: string;
  keyError: string | null;
  onRemoteModel: (model: RemoteModel | undefined) => void;
}

function ConnectionStep({ form, providerId, storedHint, keyError, onRemoteModel }: ConnectionStepProps) {
  const { values } = form;
  const preset = findPreset(values.presetId);
  const [showAdvanced, setShowAdvanced] = useState(values.apiType === "custom-http");

  const loadModels = async (): Promise<RemoteModel[]> => {
    const config = draftToConfig(form.draft);
    const stored = providerId ? await getVault().get(providerId) : {};
    const adapter = providerRegistry.create({
      config,
      secrets: { apiKey: values.apiKey ?? stored.apiKey, headers: { ...stored.headers, ...values.secretHeaders } },
    });
    try {
      return await adapter.listModels();
    } catch (caught) {
      const error = toNexaError(caught);
      throw new Error(t("{0}. You can still type the model ID.", { 0: t(error.title) }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {preset?.note ? <p className="rounded-md bg-background-deep px-3 py-2 text-[0.8125rem] text-muted">{preset.note}</p> : null}

      <Field
        label={t("Base URL")}
        htmlFor="provider-url"
        error={form.urlError ? t(form.urlError) : null}
        hint={form.resolvedUrl ? <>{t("Requests go to")}{" "}<UrlText url={form.resolvedUrl} className="text-xs" /></> : t("For example https://api.example.com/v1")}
      >
        <Input id="provider-url" type="url" inputMode="url" spellCheck={false} autoCapitalize="none" value={values.baseUrl} placeholder="https://api.example.com/v1" aria-invalid={form.urlError ? true : undefined} onChange={(event) => form.update({ baseUrl: event.target.value })} className="font-mono" />
      </Field>

      <ApiKeyField
        value={values.apiKey}
        onChange={(apiKey) => form.update({ apiKey })}
        providerId={providerId}
        storedHint={storedHint}
        placeholder={preset?.keyPlaceholder}
        required={form.requiresKey}
        error={keyError}
        viaRelay={values.connection === "relay"}
      />
      {preset?.keyUrl ? (
        <a href={preset.keyUrl} target="_blank" rel="noopener noreferrer" className="-mt-2 w-fit text-[0.8125rem] text-accent underline underline-offset-3">
          {t("Get a")}{" "}{preset.name} key
        </a>
      ) : null}

      <Field label={t("Model")} htmlFor="provider-model" hint={t("The exact ID your provider uses. Browse fetches its list if it offers one.")}>
        <ModelPicker
          id="provider-model"
          value={values.modelId}
          onChange={(modelId, remote) => {
            form.update({ modelId });
            onRemoteModel(remote);
          }}
          loadModels={loadModels}
        />
      </Field>

      <div>
        <button type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)} className="flex items-center gap-1 rounded-sm py-1 text-sm font-medium text-muted [@media(hover:hover)]:hover:text-foreground">
          <ChevronRight className={`size-4 transition-transform duration-150 ${showAdvanced ? "rotate-90" : ""}`} aria-hidden="true" />
          {t("Advanced options")}</button>
        {showAdvanced ? (
          <>
            <AdvancedHttp form={form} apiType={values.apiType} />
            {form.resolvedUrl ? <RelayChoice form={form} onChanged={() => {}} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function WizardBody({ providerId, onClose }: { providerId?: string; onClose: () => void }) {
  const provider = useProviderStore((state) => state.providers.find((item) => item.id === providerId));
  const models = useProviderStore((state) => state.models);
  const upsertProvider = useProviderStore((state) => state.upsertProvider);
  const upsertModel = useProviderStore((state) => state.upsertModel);
  const updateSettings = useSettingsStore((state) => state.update);
  const hasDefault = useSettingsStore((state) => state.settings.defaultModelId !== undefined);

  const firstModel = useMemo(() => models.find((model) => model.providerId === providerId), [models, providerId]);
  const form = useWizardForm(provider, firstModel);

  const [step, setStep] = useState<Step>(provider ? 2 : 1);
  const [custom, setCustom] = useState(false);
  const [test, setTest] = useState<TestState>({ phase: "idle" });
  const [keyError, setKeyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mobile = useIsMobile();
  const stepBody = useRef<HTMLDivElement>(null);
  const firstStep = useRef(true);
  // Which way the last step change went, worked out during render. 0 until the first change.
  const [travel, setTravel] = useState({ step, direction: 0 });
  if (travel.step !== step) setTravel({ step, direction: step > travel.step ? 1 : -1 });

  // The old step's control is gone, so focus would fall to the page. A phone gets the step
  // itself, because focusing a field there would throw up the keyboard.
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const control = mobile ? null : stepBody.current?.querySelector<HTMLElement>("input, button");
    (control ?? stepBody.current)?.focus();
  }, [step, mobile]);
  const remoteModel = useRef<RemoteModel | undefined>(undefined);
  const testAbort = useRef<AbortController | null>(null);

  const { values } = form;
  const canLeaveProviderStep = values.name.trim().length > 0;
  const keyMissing = form.requiresKey && values.apiKey === "";
  const canLeaveConnectionStep = values.baseUrl.trim().length > 0 && !form.urlError;

  const runTest = async (): Promise<void> => {
    testAbort.current?.abort();
    const controller = new AbortController();
    testAbort.current = controller;
    setTest({ phase: "testing" });
    try {
      const result = await testDraft(form.draft, values.modelId, controller.signal);
      if (!controller.signal.aborted) setTest({ phase: "done", result });
    } catch (caught) {
      if (!controller.signal.aborted) {
        const error = caught instanceof NexaError ? caught : toNexaError(caught);
        setTest({ phase: "done", result: { ok: false, latencyMs: 0, error } });
      }
    }
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await saveProvider(form.draft, provider);
      const health = test.phase === "done" ? healthFromResult(test.result) : {};
      const final = { ...saved, ...health };
      await getStorage().put("providers", final);
      upsertProvider(final);

      const modelId = values.modelId.trim();
      if (modelId && !models.some((model) => model.providerId === final.id && model.modelId === modelId)) {
        const remote = remoteModel.current?.id === modelId ? remoteModel.current : undefined;
        const tested = test.phase === "done" ? test.result.models?.find((item) => item.id === modelId) : undefined;
        const model = modelFromRemote(final.id, final.apiType, modelId, remote ?? tested);
        await upsertModel(model);
        if (!hasDefault) updateSettings({ defaultModelId: model.id });
      }
      toast.success(provider ? t("Provider saved.") : final.health === "connected" ? t("Provider connected successfully.") : t("Provider saved."));
      onClose();
    } catch (caught) {
      toast.error(toNexaError(caught).message);
    } finally {
      setSaving(false);
    }
  };

  const next = (): void => {
    if (step === 2 && keyMissing) {
      setKeyError("Enter this provider's API key.");
      return;
    }
    setKeyError(null);
    setStep((step + 1) as Step);
  };

  return (
    <>
      <StepIndicator step={step} />

      <div
        ref={stepBody}
        key={step}
        tabIndex={-1}
        className="outline-none"
        style={travel.direction === 0 ? undefined : { animation: `${travel.direction > 0 ? "step-from-right" : "step-from-left"} 180ms var(--ease-out) both` }}
      >
        {step === 1 ? (
          <ChooseProvider
            form={form}
            custom={custom}
            onCustom={() => {
              setCustom(true);
              form.applyPreset(null);
            }}
            onPick={(preset, modelId) => {
              form.applyPreset(preset);
              if (modelId) form.update({ modelId });
              setStep(2);
            }}
          />
        ) : null}

        {step === 2 ? <ConnectionStep form={form} providerId={provider?.id} storedHint={provider?.keyHint} keyError={keyError} onRemoteModel={(model) => (remoteModel.current = model)} /> : null}

        {step === 3 ? <TestPanel form={form} state={test} onTest={() => void runTest()} onReset={() => setTest({ phase: "idle" })} /> : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          {step > 1 && !(provider && step === 2) ? (
            <Button variant="ghost" onClick={() => setStep((step - 1) as Step)}>
              {t("Back")}</Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          {step === 3 ? (
            <>
              {test.phase === "done" && test.result.ok ? null : (
                <Button disabled={saving} onClick={() => void save()}>
                  {t("Save without testing")}</Button>
              )}
              {test.phase === "done" && test.result.ok ? (
                <Button variant="primary" disabled={saving} onClick={() => void save()}>
                  {t("Done")}</Button>
              ) : null}
            </>
          ) : (
            <Button variant="primary" disabled={step === 1 ? !canLeaveProviderStep || !custom : !canLeaveConnectionStep} onClick={next}>
              {t("Continue")}</Button>
          )}
        </div>
      </div>
    </>
  );
}

export function ProviderWizard() {
  const wizard = useUiStore((state) => state.wizard);
  const close = useUiStore((state) => state.closeWizard);

  return (
    <Dialog open={wizard.open} onClose={close} title={wizard.providerId ? t("Edit provider") : t("Add your AI provider")} size="m">
      {wizard.open ? <WizardBody key={wizard.providerId ?? "new"} providerId={wizard.providerId} onClose={close} /> : null}
    </Dialog>
  );
}
