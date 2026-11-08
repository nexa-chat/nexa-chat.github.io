"use client";

import { Pin } from "lucide-react";
import { useMemo } from "react";
import { useChatStore } from "./chat-store";
import { t } from "@/i18n";

function excerpt(text: string): string {
  const flat = text.replace(/[`*_#>]+/g, "").replace(/\s+/g, " ").trim();
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat || "Attachment";
}

/** The pinned messages of the branch on screen, each a shortcut to its place in the chat. */
export function PinnedBar() {
  // Select the list itself: a filtered copy would be a new array on every store update.
  const messages = useChatStore((state) => state.messages);
  const pinned = useMemo(() => messages.filter((message) => message.pinned), [messages]);
  const jumpTo = useChatStore((state) => state.jumpTo);
  if (pinned.length === 0) return null;

  return (
    <nav aria-label={t("Pinned messages")} className="flex shrink-0 items-center gap-2 overflow-x-auto overscroll-x-contain border-b border-border px-3 py-1.5 sm:px-4">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted">
        <Pin className="size-3.5 text-accent" aria-hidden="true" />
        {t("Pinned")}</span>
      {pinned.map((message) => (
        <button
          key={message.id}
          type="button"
          onClick={() => jumpTo(message.id)}
          className="press shrink-0 rounded-[0.625rem] border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] px-2.5 py-1 text-xs text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] touch:min-h-11"
        >
          {message.role === "user" ? t("You: ") : ""}
          {excerpt(message.content)}
        </button>
      ))}
    </nav>
  );
}
