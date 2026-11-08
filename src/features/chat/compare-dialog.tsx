"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { formatCost, formatTokens } from "@/lib/params";
import { getStorage } from "@/storage";
import type { Message } from "@/types";
import { Markdown } from "../markdown/markdown";
import { switchBranch } from "./chat-actions";
import { t } from "@/i18n";

function Column({ message, index, current, onShow }: { message: Message; index: number; current: boolean; onShow: () => void }) {
  const usage = message.usage;
  const tokens = usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  return (
    <section aria-label={t("Version {0}", { 0: index + 1 })} className="flex min-w-0 flex-col rounded-xl border border-border bg-surface">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{message.model?.modelName ?? t("Assistant")}</p>
          <p className="truncate text-xs text-muted tabular-nums">
            {t("Version")}{" "}{index + 1}
            {tokens > 0 ? t(" · {0} tokens", { 0: formatTokens(tokens) }) : ""}
            {message.estimatedCost === undefined ? "" : ` · ${formatCost(message.estimatedCost)}`}
          </p>
        </div>
        {current ? (
          <span className="shrink-0 rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent">{t("Shown")}</span>
        ) : (
          <button type="button" onClick={onShow} className="press shrink-0 rounded-[0.625rem] px-2 py-1 text-xs font-medium text-muted hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground touch:min-h-11">
            {t("Show in chat")}</button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[0.9375rem]">{message.content ? <Markdown content={message.content} /> : <p className="text-sm text-muted">{message.error?.title ?? t("No answer.")}</p>}</div>
    </section>
  );
}

/** The versions of one answer side by side, for instance the same question asked to two models. */
export function CompareDialog({ open, onClose, versionIds, currentId }: { open: boolean; onClose: () => void; versionIds: readonly string[]; currentId: string }) {
  const [versions, setVersions] = useState<Message[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const storage = getStorage();
    void Promise.all(versionIds.map((id) => storage.get("messages", id))).then((found) => {
      if (!cancelled) setVersions(found.filter((item): item is Message => item !== undefined));
    });
    return () => {
      cancelled = true;
    };
  }, [open, versionIds]);

  return (
    <Dialog open={open} onClose={onClose} title={t("Compare versions")} description={t("The same question, answered each time it was asked again.")} size="xl">
      <div className={`grid gap-3 ${versions.length > 2 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>
        {versions.map((message, index) => (
          <Column
            key={message.id}
            message={message}
            index={index}
            current={message.id === currentId}
            onShow={() => {
              onClose();
              void switchBranch(message.id);
            }}
          />
        ))}
      </div>
    </Dialog>
  );
}
