"use client";

import { Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { Segmented, Switch } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { BackupError, applyBackup, createBackup, parseBackup, previewBackup, type BackupPreview, type ImportMode, type NexaBackup } from "@/services/backup";
import { downloadFile } from "@/services/export";
import { formatBytes } from "@/services/files";
import { invalidateSearchIndex } from "@/services/search";
import { useChatStore } from "../chat/chat-store";
import { useProviderStore } from "../providers/provider-store";
import { useSettingsStore } from "./settings-store";
import { t } from "@/i18n";

function ExportBackup() {
  const [includeKeys, setIncludeKeys] = useState(false);
  const [working, setWorking] = useState(false);

  const run = async (): Promise<void> => {
    if (includeKeys) {
      const confirmed = await confirmAction({
        title: t("Include API keys?"),
        message: t("The file will contain your keys in plain text. Anyone who gets it can use them."),
        confirmLabel: t("Include keys"),
        danger: true,
      });
      if (!confirmed) return;
    }
    setWorking(true);
    try {
      const backup = await createBackup({ includeKeys });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(JSON.stringify(backup), `nexa-backup-${stamp}.json`, "application/json");
      toast.success(t("Backup exported."));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">{t("Export NEXA Backup")}</h2>
      <p className="mt-1 mb-3 text-sm text-muted">{t("One JSON file with your chats, providers, models, prompts and settings.")}</p>
      <div className="mb-3 max-w-md">
        <Switch label={t("Include API keys")} description={t("Off by default. Keys are written in plain text.")} checked={includeKeys} onChange={setIncludeKeys} />
      </div>
      <Button disabled={working} onClick={() => void run()}>
        <Download className="size-4" />
        {t("Export backup")}</Button>
    </section>
  );
}

function ImportBackup() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: NexaBackup; preview: BackupPreview; fileName: string } | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [working, setWorking] = useState(false);

  const onFile = async (file: File): Promise<void> => {
    try {
      const backup = parseBackup(await file.text());
      setPending({ backup, preview: await previewBackup(backup), fileName: file.name });
    } catch (caught) {
      toast.error(caught instanceof BackupError ? caught.message : t("This file couldn't be read."));
    }
  };

  const apply = async (): Promise<void> => {
    if (!pending) return;
    if (mode === "replace") {
      const confirmed = await confirmAction({
        title: t("Replace everything?"),
        message: t("All current chats, providers and keys will be deleted first. This can't be undone."),
        confirmLabel: t("Replace my data"),
        danger: true,
      });
      if (!confirmed) return;
    }
    setWorking(true);
    try {
      await applyBackup(pending.backup, mode);
      invalidateSearchIndex();
      useChatStore.getState().newChat();
      await Promise.all([useChatStore.getState().load(), useProviderStore.getState().load(), useSettingsStore.getState().load()]);
      toast.success(t("Backup imported."));
      setPending(null);
    } catch {
      toast.error(t("The import failed. Your data wasn't changed by the failed step."));
    } finally {
      setWorking(false);
    }
  };

  const preview = pending?.preview;

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">{t("Import")}</h2>
      <p className="mt-1 mb-3 text-sm text-muted">{t("Nothing changes until you confirm.")}</p>
      <input
        ref={input}
        type="file"
        name="backup"
        hidden
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
          event.target.value = "";
        }}
      />
      {preview ? (
        <div className="rounded-md border border-border p-4">
          <p className="truncate font-medium">{pending.fileName}</p>
          <p className="text-[0.8125rem] text-muted">{t("Exported")}{" "}{new Date(preview.exportedAt).toLocaleString()}</p>
          <dl className="tabular mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {(
              [
                ["Chats", preview.conversations],
                ["Messages", preview.messages],
                ["Providers", preview.providers],
                ["Models", preview.models],
                ["Prompts", preview.prompts],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted">{label}</dt>
                <dd>{value.toLocaleString("en")}</dd>
              </div>
            ))}
          </dl>
          {preview.includesKeys ? <p className="mt-2 text-[0.8125rem] text-warning">{t("This file contains API keys.")}</p> : null}
          {preview.conflicts > 0 ? <p className="mt-2 text-[0.8125rem] text-muted">{preview.conflicts} {t("chats already exist here. Merging keeps your current versions.")}</p> : null}
          <div className="mt-4">
            <Segmented<ImportMode>
              label={t("Import mode")}
              value={mode}
              options={[
                { value: "merge", label: t("Merge with my data") },
                { value: "replace", label: t("Replace my data") },
              ]}
              onChange={setMode}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setPending(null)}>{t("Cancel")}</Button>
            <Button variant={mode === "replace" ? "danger" : "primary"} disabled={working} onClick={() => void apply()}>
              {t("Import")}</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => input.current?.click()}>
          <Upload className="size-4" />
          {t("Choose a backup file")}</Button>
      )}
    </section>
  );
}

function StorageUsage() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage !== undefined && estimate.quota !== undefined) setUsage({ used: estimate.usage, quota: estimate.quota });
    });
  }, []);

  if (!usage) return null;
  return (
    <section>
      <h2 className="font-display text-lg font-semibold">{t("Storage")}</h2>
      <p className="tabular mt-1 text-sm text-muted">
        {t("Using")}{" "}{formatBytes(usage.used)} {t("of the")}{" "}{formatBytes(usage.quota)} {t("this browser allows.")}</p>
    </section>
  );
}

export function DataSection() {
  return (
    <div className="flex flex-col gap-8">
      <ExportBackup />
      <ImportBackup />
      <StorageUsage />
    </div>
  );
}
