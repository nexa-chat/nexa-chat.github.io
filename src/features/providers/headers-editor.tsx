"use client";

import { Lock, LockOpen, Plus, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { createId } from "@/lib/ids";
import type { HeaderEntry, QueryParam } from "@/types";
import { t } from "@/i18n";

interface HeadersEditorProps {
  headers: HeaderEntry[];
  secretValues: Record<string, string>;
  onChange: (headers: HeaderEntry[]) => void;
  onSecretChange: (id: string, value: string) => void;
}

export function HeadersEditor({ headers, secretValues, onChange, onSecretChange }: HeadersEditorProps) {
  const patch = (id: string, change: Partial<HeaderEntry>): void => {
    onChange(headers.map((header) => (header.id === id ? { ...header, ...change } : header)));
  };

  return (
    <div className="flex flex-col gap-2">
      {headers.map((header) => (
        <div key={header.id} className="flex items-center gap-1.5">
          <Input aria-label={t("Header name")} placeholder={t("Header name")} value={header.name} spellCheck={false} onChange={(event) => patch(header.id, { name: event.target.value })} className="min-w-0 flex-[2] font-mono" />
          <Input
            aria-label={t("Header value")}
            placeholder={header.secret ? t("Hidden value") : t("Header value")}
            type={header.secret ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            value={header.secret ? (secretValues[header.id] ?? "") : header.value}
            onChange={(event) => (header.secret ? onSecretChange(header.id, event.target.value) : patch(header.id, { value: event.target.value }))}
            className="min-w-0 flex-[3] font-mono"
          />
          <IconButton
            label={header.secret ? t("Stored encrypted. Click to store as plain text") : t("Stored as plain text. Click to encrypt")}
            active={header.secret}
            aria-pressed={header.secret}
            onClick={() => patch(header.id, { secret: !header.secret, value: "" })}
          >
            {header.secret ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          </IconButton>
          <IconButton label={t("Remove header {0}", { 0: header.name })} onClick={() => onChange(headers.filter((item) => item.id !== header.id))}>
            <X className="size-4" />
          </IconButton>
        </div>
      ))}
      <div>
        <Button size="s" onClick={() => onChange([...headers, { id: createId("hdr"), name: "", value: "", secret: false }])}>
          <Plus className="size-3.5" />
          {t("Add header")}</Button>
      </div>
    </div>
  );
}

export function QueryParamsEditor({ params, onChange }: { params: QueryParam[]; onChange: (params: QueryParam[]) => void }) {
  const patch = (id: string, change: Partial<QueryParam>): void => {
    onChange(params.map((param) => (param.id === id ? { ...param, ...change } : param)));
  };

  return (
    <div className="flex flex-col gap-2">
      {params.map((param) => (
        <div key={param.id} className="flex items-center gap-1.5">
          <Input aria-label={t("Parameter name")} placeholder={t("Name")} value={param.name} spellCheck={false} onChange={(event) => patch(param.id, { name: event.target.value })} className="min-w-0 flex-1 font-mono" />
          <Input aria-label={t("Parameter value")} placeholder={t("Value")} value={param.value} spellCheck={false} onChange={(event) => patch(param.id, { value: event.target.value })} className="min-w-0 flex-1 font-mono" />
          <IconButton label={t("Remove parameter {0}", { 0: param.name })} onClick={() => onChange(params.filter((item) => item.id !== param.id))}>
            <X className="size-4" />
          </IconButton>
        </div>
      ))}
      <div>
        <Button size="s" onClick={() => onChange([...params, { id: createId("qry"), name: "", value: "" }])}>
          <Plus className="size-3.5" />
          {t("Add parameter")}</Button>
      </div>
    </div>
  );
}
