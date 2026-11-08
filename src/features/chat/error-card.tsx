"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notifications-5";
import type { SerializedError } from "@/types";
import { useUiStore } from "../shell/ui-store";
import { t } from "@/i18n";

interface ErrorCardProps {
  error: SerializedError;
  providerId?: string;
  onRetry?: () => void;
  /** Offered when part of the answer arrived, since the error text points to it. */
  onContinue?: () => void;
}

const PROVIDER_ERRORS = new Set(["invalid_api_key", "access_denied", "not_found", "model_not_found", "invalid_endpoint", "cors", "mixed_content", "relay_unavailable", "config", "malformed_response"]);

/** Plain language first, what to do next, and the raw detail only on request. */
export function ErrorCard({ error, providerId, onRetry, onContinue }: ErrorCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const openWizard = useUiStore((state) => state.openWizard);

  return (
    <Notice variant="error" title={t(error.title)} body={`${t(error.message)} ${error.action ? t(error.action) : ""}`.trim()} className="border-danger/40 bg-danger-soft shadow-none">
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {onRetry ? (
          <Button size="s" onClick={onRetry}>
            <RotateCcw className="size-3.5" />
            {t("Retry")}</Button>
        ) : null}
        {onContinue ? (
          <Button size="s" onClick={onContinue}>
            {t("Continue")}</Button>
        ) : null}
        {providerId && PROVIDER_ERRORS.has(error.code) ? (
          <Button size="s" onClick={() => openWizard(providerId)}>
            {t("Check provider")}</Button>
        ) : null}
        {error.details ? (
          <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((value) => !value)}
            className="rounded-sm px-1.5 py-1 text-[0.8125rem] text-muted underline underline-offset-3 touch:min-h-11"
          >
            {showDetails ? t("Hide details") : t("Show details")}
          </button>
        ) : null}
      </div>
      {showDetails && error.details ? <pre className="mt-2 overflow-x-auto rounded-sm bg-code px-2.5 py-2 font-mono text-xs whitespace-pre-wrap">{error.details}</pre> : null}
    </Notice>
  );
}
