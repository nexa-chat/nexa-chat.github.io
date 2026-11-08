"use client";

import { LoaderCircle, Monitor } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { findPreset, type ProviderPreset } from "@/providers/presets";
import { detectLocalServers, type LocalServer } from "@/services/local-servers";
import { t, tn } from "@/i18n";

function Result({ server, onUse }: { server: LocalServer; onUse: (preset: ProviderPreset, modelId?: string) => void }) {
  const preset = findPreset(server.presetId);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  if (server.status === "ready" && preset) {
    return (
      <li className="flex items-center justify-between gap-3 py-2.5">
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            {server.name}
          </span>
          <span className="block truncate text-[0.8125rem] text-muted">{server.models.length > 0 ? tn(server.models.length, "{count} model: {names}", "{count} models: {names}", { names: server.models.slice(0, 3).join(", ") }) : t("Running, with no models pulled yet")}</span>
        </span>
        <Button size="s" variant="primary" onClick={() => onUse(preset, server.models[0])}>
          {t("Use")}</Button>
      </li>
    );
  }

  if (server.status === "blocked") {
    return (
      <li className="py-2.5">
        <span className="flex items-center gap-2 font-medium">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
          {server.name} {t("is running, but blocks this site")}</span>
        <span className="mt-0.5 block text-[0.8125rem] text-muted">
          {server.presetId === "ollama" ? (
            <>
              {t("Start it with")}{" "}<code className="rounded-sm bg-background-deep px-1 font-mono text-xs">{t("OLLAMA_ORIGINS=")}{origin}</code> {t("so the browser may reach it.")}</>
          ) : (
            <>{t("Turn on CORS in its server settings, then search again.")}</>
          )}
        </span>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-2.5 text-[0.8125rem] text-muted">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-border-strong" />
      {server.name}{t(": not found on this computer")}</li>
  );
}

/** Finds Ollama or LM Studio on this computer, and sets either up in one click. */
export function LocalDetect({ onUse }: { onUse: (preset: ProviderPreset, modelId?: string) => void }) {
  const [state, setState] = useState<{ phase: "idle" } | { phase: "searching" } | { phase: "done"; servers: LocalServer[] }>({ phase: "idle" });

  const search = async (): Promise<void> => {
    setState({ phase: "searching" });
    setState({ phase: "done", servers: await detectLocalServers() });
  };

  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <Monitor className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t("Models on this computer")}</span>
            <span className="block text-[0.8125rem] text-muted">{t("Looks for Ollama and LM Studio. Your browser may ask first.")}</span>
          </span>
        </span>
        <Button size="s" disabled={state.phase === "searching"} onClick={() => void search()}>
          {state.phase === "searching" ? <LoaderCircle className="animate-spin" /> : null}
          {state.phase === "done" ? t("Search again") : t("Search")}
        </Button>
      </div>
      {state.phase === "done" ? (
        <ul aria-live="polite" className="mt-2 divide-y divide-border border-t border-border">
          {state.servers.map((server) => (
            <Result key={server.presetId} server={server} onUse={onUse} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
