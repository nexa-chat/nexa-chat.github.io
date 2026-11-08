"use client";

import { useEffect, useState } from "react";
import { Field, Input, Segmented, Select, Switch, Textarea, moveRadio } from "@/components/ui/field";
import { RELAY_PATH } from "@/lib/http";
import { GENERATION_PRESETS } from "@/lib/params";
import { PALETTES } from "@/lib/palettes";
import type { EnterBehavior, LanguageSetting, PresetId, SidebarSize, TextSize, ThemeSetting } from "@/types";
import { useProviderStore } from "../providers/provider-store";
import { PromptLibrary } from "./prompt-library";
import { useSettingsStore } from "./settings-store";
import { t } from "@/i18n";

function useSettings() {
  return { settings: useSettingsStore((state) => state.settings), update: useSettingsStore((state) => state.update) };
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="flex max-w-xl flex-col gap-5">{children}</div>;
}

export function GeneralSection() {
  const { settings, update } = useSettings();
  const models = useProviderStore((state) => state.models);

  return (
    <Stack>
      <Field label={t("Language")} htmlFor="language" hint={t("Automatic follows your browser's language.")}>
        <Select id="language" className="w-56" value={settings.language} onChange={(event) => update({ language: event.target.value as LanguageSetting })}>
          <option value="auto">{t("Automatic")}</option>
          <option value="en">English</option>
          <option value="fr">Français</option>
        </Select>
      </Field>
      <Field label={t("Default model")} htmlFor="default-model" hint={t("Used for new chats.")}>
        <Select id="default-model" value={settings.defaultModelId ?? ""} onChange={(event) => update({ defaultModelId: event.target.value || undefined })}>
          <option value="">{t("First available model")}</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </Select>
      </Field>
      <Switch label={t("Generate chat titles")} description={t("Sends your first message to the selected model to name the chat. Costs a few tokens. When off, the title comes from your message.")} checked={settings.autoTitle} onChange={(autoTitle) => update({ autoTitle })} />
      <Switch label={t("Show usage")} description={t("Shows token counts and cost estimates under responses, when the provider reports them.")} checked={settings.showUsage} onChange={(showUsage) => update({ showUsage })} />
      <FallbackField />
      {settings.showUsage ? (
        <Field label={t("Highlight answers costing more than")} htmlFor="cost-highlight" hint={t("In dollars, from the prices you entered. Cheaper answers stay quiet.")}>
          <Input
            id="cost-highlight"
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            className="tabular w-32"
            value={settings.costHighlightAt}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 0) update({ costHighlightAt: value });
            }}
          />
        </Field>
      ) : null}
    </Stack>
  );
}

/** Which model answers when the chosen one fails on the provider's side. */
function FallbackField() {
  const { settings, update } = useSettings();
  const models = useProviderStore((state) => state.models);
  const providers = useProviderStore((state) => state.providers);
  if (models.length < 2) return null;
  return (
    <Field label={t("If a request fails, answer with")} htmlFor="fallback-model" hint={t("Used when a provider is down, overloaded or rate limiting, before any text arrives. The answer says which model replied.")}>
      <Select id="fallback-model" value={settings.fallbackModelId ?? ""} onChange={(event) => update({ fallbackModelId: event.target.value || undefined })}>
        <option value="">{t("No fallback")}</option>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} · {providers.find((provider) => provider.id === model.providerId)?.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function AppearanceSection() {
  const { settings, update } = useSettings();
  return (
    <Stack>
      <Field label={t("Theme")}>
        <Segmented<ThemeSetting>
          label={t("Theme")}
          value={settings.theme}
          options={[
            { value: "dark", label: t("Dark") },
            { value: "light", label: t("Light") },
            { value: "system", label: t("System") },
          ]}
          onChange={(theme) => update({ theme })}
        />
      </Field>
      <Field label={t("Palette")}>
        <div role="radiogroup" aria-label={t("Palette")} onKeyDown={moveRadio} className="flex flex-wrap gap-2">
          {PALETTES.map((palette) => (
            <button
              key={palette.id}
              type="button"
              role="radio"
              aria-checked={settings.palette === palette.id}
              tabIndex={settings.palette === palette.id ? 0 : -1}
              onClick={() => update({ palette: palette.id })}
              className={`press flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors duration-100 ${
                settings.palette === palette.id ? "border-accent bg-accent-soft" : "border-border [@media(hover:hover)]:hover:border-border-strong"
              }`}
            >
              <span aria-hidden="true" className="size-4 rounded-full border border-border-strong" style={{ background: palette.accent }} />
              {palette.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("Text size")}>
        <Segmented<TextSize>
          label={t("Text size")}
          value={settings.textSize}
          options={[
            { value: "small", label: t("Small") },
            { value: "default", label: t("Default") },
            { value: "large", label: t("Large") },
          ]}
          onChange={(textSize) => update({ textSize })}
        />
      </Field>
      <Field label={t("Sidebar size")} hint={t("Row height and icon size. Drag the sidebar's edge to change its width.")}>
        <Segmented<SidebarSize>
          label={t("Sidebar size")}
          value={settings.sidebarSize}
          options={[
            { value: "compact", label: t("Compact") },
            { value: "default", label: t("Default") },
            { value: "large", label: t("Large") },
          ]}
          onChange={(sidebarSize) => update({ sidebarSize })}
        />
      </Field>
      <Switch label={t("Line numbers in code")} checked={settings.showLineNumbers} onChange={(showLineNumbers) => update({ showLineNumbers })} />
    </Stack>
  );
}

export function ChatSection() {
  const { settings, update } = useSettings();
  return (
    <div className="flex flex-col gap-8">
      <Stack>
        <Field label={t("Enter key")}>
          <Segmented<EnterBehavior>
            label={t("Enter key")}
            value={settings.enterBehavior}
            options={[
              { value: "send", label: t("Enter sends") },
              { value: "newline", label: t("Ctrl+Enter sends") },
            ]}
            onChange={(enterBehavior) => update({ enterBehavior })}
          />
        </Field>
        <Field label={t("Default response style")} htmlFor="default-preset">
          <Select id="default-preset" value={settings.defaultPreset} onChange={(event) => update({ defaultPreset: event.target.value as PresetId })}>
            {GENERATION_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {t(preset.label)}: {t(preset.description)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Default instructions")} htmlFor="default-system" hint={t("Sent as the system prompt in chats that use the Default preset.")}>
          <Textarea id="default-system" rows={4} value={settings.defaultSystemPrompt} onChange={(event) => update({ defaultSystemPrompt: event.target.value })} />
        </Field>
      </Stack>
      <PromptLibrary />
    </div>
  );
}

const SHORTCUTS: readonly [string, string][] = [
  ["Ctrl/Cmd + K", "Search"],
  ["Ctrl/Cmd + N, or Alt + N", "New chat"],
  ["Ctrl/Cmd + Shift + P", "Command palette"],
  ["Ctrl/Cmd + /", "Focus composer"],
  ["Esc", "Stop generation"],
  ["Enter", "Send (swappable in Chat settings)"],
  ["Shift + Enter", "New line"],
];

export function KeyboardSection() {
  return (
    <div className="max-w-xl">
      <dl className="divide-y divide-border rounded-md border border-border">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-muted">{t(action)}</dt>
            <dd className="shrink-0 font-mono text-[0.8125rem]">{t(keys)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[0.8125rem] text-muted">{t("Browsers keep Ctrl+N for themselves in a normal tab. It works in the installed app. Alt+N works everywhere.")}</p>
    </div>
  );
}

function RelayStatus() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(RELAY_PATH, { cache: "no-store" })
      .then(async (response) => setEnabled(response.ok && ((await response.json()) as { enabled?: boolean }).enabled === true))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled === null) return null;
  return (
    <p className="text-sm text-muted">
      {enabled ? t("This deployment offers a relay. It's off for every provider until you turn it on in that provider's test step.") : t("This deployment has no relay. Requests can only go directly from your browser.")}
    </p>
  );
}

export function AdvancedSection() {
  const { settings, update } = useSettings();
  return (
    <Stack>
      <Field label={t("Request timeout, in seconds")} htmlFor="timeout" hint={t("How long to wait for a first response.")}>
        <Input
          id="timeout"
          type="number"
          min={10}
          max={600}
          className="tabular w-32"
          value={settings.requestTimeoutSeconds}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (value >= 10 && value <= 600) update({ requestTimeoutSeconds: value });
          }}
        />
      </Field>
      <Switch label={t("Retry temporary errors")} description={t("Up to 2 retries with increasing delays, only before a response starts. Rate limits with a long wait are left to you.")} checked={settings.autoRetry} onChange={(autoRetry) => update({ autoRetry })} />
      <div>
        <p className="mb-1 text-sm font-medium">{t("Relay")}</p>
        <RelayStatus />
      </div>
    </Stack>
  );
}
