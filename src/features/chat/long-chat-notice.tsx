"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { estimateTokens, formatTokens } from "@/lib/params";
import { continueWithSummary } from "./chat-actions";
import { useChatStore } from "./chat-store";
import { t } from "@/i18n";

/** Above this, each message resends enough of the chat that a summary starts to pay off. */
const LONG_CHAT_TOKENS = 16_000;

/** Offers, once per chat, to continue a long chat from a summary. Dismissing it is remembered for the visit. */
export function LongChatNotice() {
  const activeId = useChatStore((state) => state.activeId);
  const messages = useChatStore((state) => state.messages);
  const generating = useChatStore((state) => (state.activeId ? state.activeId in state.streams : false));
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const tokens = useMemo(() => estimateTokens(messages.reduce((sum, message) => sum + message.content.length, 0)), [messages]);
  if (!activeId || generating || tokens < LONG_CHAT_TOKENS || dismissed.has(activeId)) return null;

  return (
    <div className="mx-auto mb-1 flex w-full max-w-[var(--reading-width)] items-center gap-3 px-4 sm:px-6">
      <p className="min-w-0 flex-1 text-[0.8125rem] text-muted">
        {t("This chat is long: each message resends about")}{" "}{formatTokens(tokens)} tokens.{" "}
        <button type="button" onClick={() => void continueWithSummary(activeId)} className="font-medium text-accent underline underline-offset-2 touch:min-h-11">
          {t("Continue in a new chat from a summary")}</button>
      </p>
      <button type="button" aria-label={t("Dismiss")} onClick={() => setDismissed((current) => new Set(current).add(activeId))} className="shrink-0 rounded-[0.625rem] p-1 text-faint hover:text-foreground touch:min-h-11 touch:min-w-11">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
