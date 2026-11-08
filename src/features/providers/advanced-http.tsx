"use client";

import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DEFAULT_BODY_TEMPLATE } from "@/providers/custom/adapter";
import { DEFAULT_ANTHROPIC_VERSION } from "@/providers/anthropic/adapter";
import type { ApiType, AuthType, HttpMethod, ProviderAdvanced, StreamFormat } from "@/types";
import { HeadersEditor, QueryParamsEditor } from "./headers-editor";
import type { WizardForm } from "./use-wizard-form";
import { t } from "@/i18n";

interface AdvancedHttpProps {
  form: WizardForm;
  apiType: ApiType;
}

const AUTH_OPTIONS: { value: AuthType; label: string }[] = [
  { value: "bearer", label: "Bearer token" },
  { value: "api-key-header", label: "API key header" },
  { value: "basic", label: "Basic (user:password)" },
  { value: "custom", label: "Custom header and prefix" },
  { value: "none", label: "None" },
];

export function AdvancedHttp({ form, apiType }: AdvancedHttpProps) {
  const { advanced } = form.values;
  const set = (patch: Partial<ProviderAdvanced>): void => form.update({ advanced: { ...advanced, ...patch } });
  const defaultAuth: AuthType = apiType === "anthropic" || apiType === "gemini" ? "api-key-header" : "bearer";
  const authType = advanced.authType ?? defaultAuth;

  return (
    <div className="flex flex-col gap-4 pt-1">
      <Field label={t("Headers")} hint={t("Sent with every request. Examples: HTTP-Referer, X-Title, api-key.")}>
        <HeadersEditor
          headers={form.values.headers}
          secretValues={form.values.secretHeaders}
          onChange={(headers) => form.update({ headers })}
          onSecretChange={(id, value) => form.update({ secretHeaders: { ...form.values.secretHeaders, [id]: value } })}
        />
      </Field>

      <Field label={t("Query parameters")}>
        <QueryParamsEditor params={advanced.queryParams ?? []} onChange={(queryParams) => set({ queryParams })} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Endpoint path")} htmlFor="adv-path" hint={t("Replaces the default path.")}>
          <Input id="adv-path" spellCheck={false} placeholder={form.defaultPath} value={advanced.endpointPath ?? ""} onChange={(event) => set({ endpointPath: event.target.value || undefined })} className="font-mono" />
        </Field>
        <Field label={t("Model list path")} htmlFor="adv-models" hint={t("Leave empty to use the default.")}>
          <Input id="adv-models" spellCheck={false} placeholder="/models" value={advanced.modelsPath ?? ""} onChange={(event) => set({ modelsPath: event.target.value || undefined })} className="font-mono" />
        </Field>
        <Field label={t("HTTP method")} htmlFor="adv-method">
          <Select id="adv-method" value={advanced.method ?? "POST"} onChange={(event) => set({ method: event.target.value as HttpMethod })}>
            <option value="POST">{t("POST")}</option>
            <option value="PUT">{t("PUT")}</option>
          </Select>
        </Field>
        <Field label={t("Authentication")} htmlFor="adv-auth">
          <Select id="adv-auth" value={authType} onChange={(event) => set({ authType: event.target.value as AuthType })}>
            {AUTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </Select>
        </Field>
        {authType === "api-key-header" || authType === "custom" ? (
          <Field label={t("Key header name")} htmlFor="adv-auth-header">
            <Input id="adv-auth-header" spellCheck={false} placeholder={authType === "custom" ? "authorization" : "x-api-key"} value={advanced.authHeaderName ?? ""} onChange={(event) => set({ authHeaderName: event.target.value || undefined })} className="font-mono" />
          </Field>
        ) : null}
        {authType === "custom" ? (
          <Field label={t("Key prefix")} htmlFor="adv-auth-prefix">
            <Input id="adv-auth-prefix" spellCheck={false} placeholder={t("Token ")} value={advanced.authPrefix ?? ""} onChange={(event) => set({ authPrefix: event.target.value || undefined })} className="font-mono" />
          </Field>
        ) : null}
        {apiType === "anthropic" ? (
          <Field label="anthropic-version" htmlFor="adv-version">
            <Input id="adv-version" spellCheck={false} placeholder={DEFAULT_ANTHROPIC_VERSION} value={advanced.anthropicVersion ?? ""} onChange={(event) => set({ anthropicVersion: event.target.value || undefined })} className="font-mono" />
          </Field>
        ) : null}
      </div>

      {apiType === "custom-http" ? (
        <>
          <Field label={t("Streaming format")} htmlFor="adv-stream">
            <Select id="adv-stream" value={advanced.streamFormat ?? "sse"} onChange={(event) => set({ streamFormat: event.target.value as StreamFormat })}>
              <option value="sse">{t("Server-sent events (SSE)")}</option>
              <option value="ndjson">{t("Newline-delimited JSON")}</option>
              <option value="none">{t("No streaming")}</option>
            </Select>
          </Field>
          <Field label={t("Request body")} htmlFor="adv-body" hint={t("JSON. Use {{model}}, {{messages}}, {{prompt}}, {{system}} and {{stream}}.")}>
            <Textarea id="adv-body" rows={6} spellCheck={false} placeholder={DEFAULT_BODY_TEMPLATE} value={advanced.bodyTemplate ?? ""} onChange={(event) => set({ bodyTemplate: event.target.value || undefined })} className="font-mono text-[0.8125rem]" />
          </Field>
          <Field label={t("Response text path")} htmlFor="adv-text" hint={t("Where the text is in each response, for example choices.0.delta.content. Leave empty to detect it.")}>
            <Input id="adv-text" spellCheck={false} placeholder="choices.0.delta.content" value={advanced.responseTextPath ?? ""} onChange={(event) => set({ responseTextPath: event.target.value || undefined })} className="font-mono" />
          </Field>
        </>
      ) : null}
    </div>
  );
}
