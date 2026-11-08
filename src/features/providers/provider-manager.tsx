"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { hostOf } from "@/lib/url";
import { API_TYPE_LABELS } from "@/providers/presets";
import type { ProviderConfig, ProviderHealth } from "@/types";
import { useUiStore } from "../shell/ui-store";
import { useProviderStore } from "./provider-store";
import { t } from "@/i18n";

const HEALTH: Record<ProviderHealth, { label: string; dot: string }> = {
  connected: { label: "Connected", dot: "bg-success" },
  not_tested: { label: "Not tested", dot: "bg-faint" },
  error: { label: "Error", dot: "bg-danger" },
  rate_limited: { label: "Rate limited", dot: "bg-warning" },
};

export function HealthBadge({ provider }: { provider: ProviderConfig }) {
  const health = HEALTH[provider.health];
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted" title={provider.healthDetail}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${health.dot}`} />
      {t(health.label)}
    </span>
  );
}

function ProviderRow({ provider }: { provider: ProviderConfig }) {
  const models = useProviderStore((state) => state.models.filter((model) => model.providerId === provider.id).length);
  const testProvider = useProviderStore((state) => state.testProvider);
  const removeProvider = useProviderStore((state) => state.removeProvider);
  const openWizard = useUiStore((state) => state.openWizard);
  const [testing, setTesting] = useState(false);

  const test = async (): Promise<void> => {
    setTesting(true);
    const result = await testProvider(provider.id);
    setTesting(false);
    if (result.ok) toast.success(t("{0} is connected.", { 0: provider.name }));
    else toast.error(`${provider.name}: ${t(result.error?.title ?? "Connection failed")}.`);
  };

  const remove = async (): Promise<void> => {
    const confirmed = await confirmAction({
      title: t("Delete {0}?", { 0: provider.name }),
      message: t("Its API key and {0} will be removed from this browser. Your chats stay.", { 0: models === 1 ? "1 model" : `${models} models` }),
      confirmLabel: t("Delete provider"),
      danger: true,
    });
    if (confirmed) {
      await removeProvider(provider.id);
      toast.success(t("Provider deleted."));
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate font-medium">{provider.name}</p>
        <p className="truncate text-[0.8125rem] text-muted">{API_TYPE_LABELS[provider.apiType]}</p>
        <p className="truncate font-mono text-xs text-faint">
          {hostOf(provider.baseUrl)}
          {provider.connection === "relay" ? " via relay" : ""}
        </p>
      </div>
      <HealthBadge provider={provider} />
      <div className="flex items-center gap-1.5">
        <Button size="s" onClick={() => openWizard(provider.id)}>
          {t("Edit")}</Button>
        <Button size="s" disabled={testing} onClick={() => void test()}>
          {testing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {t("Test")}</Button>
        {/* Set apart from the other actions so it can't be hit by accident. */}
        <Button size="s" variant="danger" className="ml-3" onClick={() => void remove()}>
          {t("Delete")}</Button>
      </div>
    </li>
  );
}

export function ProviderManager() {
  const providers = useProviderStore((state) => state.providers);
  const openWizard = useUiStore((state) => state.openWizard);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t("My providers")}</h2>
        <Button variant="primary" onClick={() => openWizard()}>
          <Plus className="size-4" />
          {t("Add provider")}</Button>
      </div>
      {providers.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong px-6 py-10 text-center">
          <p className="font-medium">{t("No providers yet")}</p>
          <p className="mt-1 text-sm text-muted">{t("Add an API key and a base URL to start chatting.")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {providers.map((provider) => (
            <ProviderRow key={provider.id} provider={provider} />
          ))}
        </ul>
      )}
    </div>
  );
}
