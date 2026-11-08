"use client";

import { useCallback, useMemo, useState } from "react";
import { validateBaseUrl } from "@/lib/url";
import { providerRegistry } from "@/providers";
import { findPreset, type ProviderPreset } from "@/providers/presets";
import type { ProviderDraft } from "@/services/provider-service";
import type { ApiType, ConnectionMode, HeaderEntry, ModelConfig, ProviderAdvanced, ProviderConfig } from "@/types";

export interface WizardValues {
  presetId?: string;
  name: string;
  apiType: ApiType;
  baseUrl: string;
  /** Undefined keeps the stored key. */
  apiKey: string | undefined;
  modelId: string;
  headers: HeaderEntry[];
  secretHeaders: Record<string, string>;
  advanced: ProviderAdvanced;
  connection: ConnectionMode;
}

const EMPTY: WizardValues = {
  name: "",
  apiType: "openai",
  baseUrl: "",
  apiKey: "",
  modelId: "",
  headers: [],
  secretHeaders: {},
  advanced: {},
  connection: "direct",
};

function fromProvider(provider: ProviderConfig, model: ModelConfig | undefined): WizardValues {
  return {
    presetId: provider.presetId,
    name: provider.name,
    apiType: provider.apiType,
    baseUrl: provider.baseUrl,
    // Undefined keeps the stored key, so an untouched field can never erase it.
    apiKey: undefined,
    modelId: model?.modelId ?? "",
    headers: provider.headers,
    secretHeaders: {},
    advanced: provider.advanced,
    connection: provider.connection,
  };
}

export interface WizardForm {
  values: WizardValues;
  update: (patch: Partial<WizardValues>) => void;
  applyPreset: (preset: ProviderPreset | null) => void;
  draft: ProviderDraft;
  /** The address chat requests will reach, shown so nobody has to guess. */
  resolvedUrl: string | null;
  defaultPath: string;
  requiresKey: boolean;
  urlError: string | null;
}

export function useWizardForm(existing: ProviderConfig | undefined, existingModel: ModelConfig | undefined): WizardForm {
  const [values, setValues] = useState<WizardValues>(() => (existing ? fromProvider(existing, existingModel) : EMPTY));

  const update = useCallback((patch: Partial<WizardValues>) => setValues((current) => ({ ...current, ...patch })), []);

  const applyPreset = useCallback((preset: ProviderPreset | null) => {
    setValues(
      preset
        ? { ...EMPTY, presetId: preset.id, name: preset.name, apiType: preset.apiType, baseUrl: preset.baseUrl }
        : { ...EMPTY, presetId: undefined },
    );
  }, []);

  const draft = useMemo<ProviderDraft>(
    () => ({
      id: existing?.id,
      name: values.name,
      apiType: values.apiType,
      presetId: values.presetId,
      baseUrl: values.baseUrl,
      headers: values.headers,
      advanced: values.advanced,
      connection: values.connection,
      apiKey: values.apiKey,
      secretHeaders: values.secretHeaders,
    }),
    [existing?.id, values],
  );

  const urlError = values.baseUrl ? validateBaseUrl(values.baseUrl) : null;

  const { resolvedUrl, defaultPath } = useMemo(() => {
    const fallback = values.apiType === "anthropic" ? "/messages" : "/chat/completions";
    if (!values.baseUrl || validateBaseUrl(values.baseUrl)) return { resolvedUrl: null, defaultPath: fallback };
    try {
      const adapter = providerRegistry.get(values.apiType)?.create({
        config: { ...draftConfig(values), advanced: { ...values.advanced } },
        secrets: {},
      });
      return { resolvedUrl: adapter?.resolveChatUrl(values.modelId || "{model}", true) ?? null, defaultPath: fallback };
    } catch {
      return { resolvedUrl: null, defaultPath: fallback };
    }
  }, [values]);

  const preset = findPreset(values.presetId);
  const authNone = values.advanced.authType === "none";
  const requiresKey = !authNone && (preset ? preset.requiresKey : false);

  return { values, update, applyPreset, draft, resolvedUrl, defaultPath, requiresKey, urlError };
}

function draftConfig(values: WizardValues): ProviderConfig {
  return {
    id: "preview",
    name: values.name,
    apiType: values.apiType,
    baseUrl: values.baseUrl,
    headers: [],
    advanced: values.advanced,
    connection: values.connection,
    health: "not_tested",
    createdAt: 0,
    updatedAt: 0,
  };
}
