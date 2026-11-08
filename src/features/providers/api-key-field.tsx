"use client";

import { Check, Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useCopy } from "@/hooks/use-copy";
import { maskKey } from "@/lib/redact";
import { getVault } from "@/storage";
import { t } from "@/i18n";

const REVEAL_MS = 20_000;

interface ApiKeyFieldProps {
  /** Undefined means "keep the stored key". An empty string means "remove it". */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  providerId?: string;
  storedHint?: string;
  placeholder?: string;
  required: boolean;
  error?: string | null;
  viaRelay?: boolean;
}

function StoredKey({ providerId, hint, onReplace, onRemove }: { providerId: string; hint: string; onReplace: () => void; onRemove: () => void }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  // A revealed key doesn't stay on screen.
  useEffect(() => {
    if (revealed === null) return;
    const timer = setTimeout(() => setRevealed(null), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  const readKey = async (): Promise<string> => (await getVault().get(providerId)).apiKey ?? "";

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background-deep py-1 pr-1 pl-3">
      <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]">{revealed ?? maskKey(hint)}</span>
      <IconButton
        size="s"
        label={revealed === null ? t("Show key") : t("Hide key")}
        onClick={() => {
          if (revealed !== null) setRevealed(null);
          else void readKey().then(setRevealed);
        }}
      >
        {revealed === null ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </IconButton>
      <IconButton size="s" label={copied ? t("Copied") : t("Copy key")} onClick={() => void readKey().then(copy)}>
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </IconButton>
      <Button size="s" variant="ghost" onClick={onReplace}>
        {t("Replace")}</Button>
      <IconButton size="s" label={t("Delete key")} onClick={onRemove}>
        <Trash2 className="size-3.5" />
      </IconButton>
    </div>
  );
}

export function ApiKeyField({ value, onChange, providerId, storedHint, placeholder, required, error, viaRelay = false }: ApiKeyFieldProps) {
  const [visible, setVisible] = useState(false);
  const showStored = value === undefined && providerId !== undefined && storedHint !== undefined;

  return (
    <Field label={required ? t("API key") : t("API key (optional)")} htmlFor="provider-key" error={error} hint={viaRelay ? t("Encrypted and kept in this browser. Sent to this provider through the relay you turned on.") : t("Encrypted and kept in this browser. Sent straight to this provider.")}>
      {showStored ? (
        <StoredKey providerId={providerId} hint={storedHint} onReplace={() => onChange("")} onRemove={() => onChange("")} />
      ) : (
        <div className="relative">
          <Input
            id="provider-key"
            type={visible ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            data-1p-ignore
            value={value ?? ""}
            placeholder={placeholder ?? t("Paste your key")}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(event.target.value)}
            className="pr-10 font-mono"
          />
          <IconButton size="s" label={visible ? t("Hide key") : t("Show key")} onClick={() => setVisible((current) => !current)} className="absolute top-1/2 right-1.5 -translate-y-1/2">
            {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </IconButton>
        </div>
      )}
    </Field>
  );
}
