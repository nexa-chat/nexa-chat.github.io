"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/field";
import { RELAY_PATH } from "@/lib/http";
import { hostOf, isLocalHost } from "@/lib/url";
import type { ConnectionResult } from "@/providers";
import type { WizardForm } from "./use-wizard-form";
import { t } from "@/i18n";

export type TestState = { phase: "idle" } | { phase: "testing" } | { phase: "done"; result: ConnectionResult };

function useRelayAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(RELAY_PATH, { method: "GET", cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { enabled?: boolean };
        if (!cancelled) setAvailable(response.ok && body.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

export function RelayChoice({ form, onChanged }: { form: WizardForm; onChanged: () => void }) {
  const available = useRelayAvailable();
  const host = hostOf(form.values.baseUrl);

  if (isLocalHost(new URL(form.values.baseUrl).hostname)) {
    return <p className="mt-3 text-sm text-muted">{t("This server runs on your machine, so a relay can't reach it. Allow this site's address in the server's CORS settings.")}</p>;
  }

  if (available === false) {
    return <p className="mt-3 text-sm text-muted">{t("This deployment has no relay. Use an endpoint that allows browser requests, such as a gateway you control.")}</p>;
  }

  return (
    <div className="mt-3 rounded-md border border-border-strong p-3">
      <Switch
        label={t("Send requests through this site's relay")}
        description={t("Your key and messages would pass through this site's server on their way to {0}. The relay stores and logs nothing, but you are trusting whoever runs this deployment.", { 0: host })}
        checked={form.values.connection === "relay"}
        disabled={available === null}
        onChange={(checked) => {
          form.update({ connection: checked ? "relay" : "direct" });
          onChanged();
        }}
      />
    </div>
  );
}

interface TestPanelProps {
  form: WizardForm;
  state: TestState;
  onTest: () => void;
  onReset: () => void;
}

export function TestPanel({ form, state, onTest, onReset }: TestPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const result = state.phase === "done" ? state.result : undefined;
  const offerRelay = form.values.connection === "relay" || result?.error?.code === "cors";

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">{t("Provider")}</dt>
        <dd className="min-w-0 truncate">{form.values.name}</dd>
        <dt className="text-muted">{t("Endpoint")}</dt>
        <dd className="min-w-0 truncate font-mono text-[0.8125rem]">{form.resolvedUrl}</dd>
        {form.values.modelId ? (
          <>
            <dt className="text-muted">{t("Model")}</dt>
            <dd className="min-w-0 truncate font-mono text-[0.8125rem]">{form.values.modelId}</dd>
          </>
        ) : null}
      </dl>

      <div>
        <Button variant={result?.ok ? "secondary" : "primary"} disabled={state.phase === "testing"} onClick={onTest}>
          {state.phase === "testing" ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {state.phase === "testing" ? t("Testing connection…") : result ? t("Test again") : t("Test connection")}
        </Button>
      </div>

      <div aria-live="polite">
        {result?.ok ? (
          <div className="fade-in">
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <Check className="size-4" aria-hidden="true" />
              {t("Connection successful")}<span className="tabular font-normal text-muted">{result.latencyMs} ms</span>
            </p>
            {result.modelListed === false ? <p className="mt-1 text-sm text-muted">{t("This model isn't in the provider's list, but it answered.")}</p> : null}
          </div>
        ) : null}

        {result && !result.ok && result.error ? (
          <div className="fade-in">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <X className="size-4" aria-hidden="true" />
              {t("Connection failed")}</p>
            <p className="mt-1 text-sm font-medium">{t(result.error.title)}</p>
            <p className="text-sm text-muted">
              {t(result.error.message)} {result.error.action ? t(result.error.action) : null}
            </p>
            {result.error.details ? (
              <>
                <button type="button" aria-expanded={showDetails} onClick={() => setShowDetails((value) => !value)} className="mt-1 text-[0.8125rem] text-muted underline underline-offset-3 touch:min-h-11">
                  {showDetails ? t("Hide details") : t("Show details")}
                </button>
                {showDetails ? <pre className="mt-1.5 overflow-x-auto rounded-sm bg-code px-2.5 py-2 font-mono text-xs whitespace-pre-wrap">{result.error.details}</pre> : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {offerRelay ? <RelayChoice form={form} onChanged={onReset} /> : null}
    </div>
  );
}
