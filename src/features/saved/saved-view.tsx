"use client";

import { Menu as MenuIcon, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { isSaved } from "@/services/branches";
import { getStorage } from "@/storage";
import type { Message } from "@/types";
import { openMessage, toggleSaved } from "../chat/chat-actions";
import { useChatStore } from "../chat/chat-store";
import { useUiStore } from "../shell/ui-store";
import { t } from "@/i18n";

function SavedCard({ message, onRemoved }: { message: Message; onRemoved: () => void }) {
  const router = useRouter();
  const title = useChatStore((state) => state.conversations.find((item) => item.id === message.conversationId)?.title);

  return (
    <li className="rounded-md border border-border bg-surface p-4">
      <p dir="auto" className="line-clamp-5 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
        {message.content}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-faint">
          {title ?? t("Deleted chat")}
          {message.model ? ` · ${message.model.modelName}` : ""}
          {` · ${new Date(message.createdAt).toLocaleDateString()}`}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {title ? (
            <Button
              size="s"
              onClick={() => {
                void openMessage(message.conversationId, message.id).then(() => router.push(`/chat?c=${encodeURIComponent(message.conversationId)}`));
              }}
            >
              {t("Open in chat")}</Button>
          ) : null}
          <IconButton
            size="s"
            label={t("Remove from saved answers")}
            onClick={() => {
              void toggleSaved(message);
              onRemoved();
            }}
          >
            <Star className="size-3.5 text-warning" fill="currentColor" />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

export function SavedView() {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [saved, setSaved] = useState<Message[] | null>(null);

  useEffect(() => {
    void getStorage()
      .getAll("messages")
      .then((messages) => setSaved(messages.filter(isSaved).sort((a, b) => b.createdAt - a.createdAt)));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-3">
        <IconButton label={t("Open sidebar")} className="md:hidden" onClick={toggleSidebar}>
          <MenuIcon className="size-5" />
        </IconButton>
        <h1 className="px-1 font-display text-[0.9375rem] font-semibold">{t("Saved answers")}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
          {saved?.length === 0 ? <p className="py-16 text-center text-sm text-muted">{t("No saved answers yet. Star an answer in a chat to keep it here.")}</p> : null}
          <ul className="flex flex-col gap-3">
            {saved?.map((message) => (
              <SavedCard key={message.id} message={message} onRemoved={() => setSaved((items) => items?.filter((item) => item.id !== message.id) ?? null)} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
