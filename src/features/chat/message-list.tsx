"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Message } from "@/types";
import { useChatStore } from "./chat-store";
import { MessageRow } from "./message-row";
import { t } from "@/i18n";

const STICK_THRESHOLD_PX = 96;

/** Tokens stay silent, because reading each one aloud would be unusable. Only the outcome is announced. */
function outcomeOf(message: Message | undefined): string {
  if (message?.role !== "assistant") return "";
  if (message.status === "streaming") return t("Generating a response.");
  if (message.status === "stopped") return t("Response stopped.");
  if (message.status === "error") return `${t("Response failed.")} ${message.error ? t(message.error.title) : ""}`.trim();
  return t("Response complete.");
}

/** Only rows near the viewport exist in the DOM, so long chats stay as cheap as short ones. */
export function MessageList() {
  const messages = useChatStore((state) => state.messages);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const jumpTarget = useChatStore((state) => state.jumpTarget);
  const [flashId, setFlashId] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer owns its own subscription
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 140,
    overscan: 6,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  const totalSize = virtualizer.getTotalSize();

  const scrollToEnd = useCallback(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);

  // Follow the stream, unless the reader has scrolled up to read something.
  useLayoutEffect(() => {
    if (stick.current) scrollToEnd();
  }, [totalSize, scrollToEnd]);

  const last = messages.at(-1);
  const lastId = last?.id;
  useEffect(() => {
    if (useChatStore.getState().keepScroll) {
      useChatStore.setState({ keepScroll: false });
      return;
    }
    stick.current = true;
    scrollToEnd();
  }, [lastId, scrollToEnd]);

  // The composer opens and closes, which resizes this list without changing its content.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (stick.current) scrollToEnd();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollToEnd]);

  useEffect(() => {
    if (!jumpTarget) return;
    const index = messages.findIndex((message) => message.id === jumpTarget);
    useChatStore.getState().jumpTo(null);
    if (index === -1) return;
    stick.current = false;
    virtualizer.scrollToIndex(index, { align: "start" });
    setFlashId(jumpTarget);
    const timer = window.setTimeout(() => setFlashId(null), 1400);
    return () => window.clearTimeout(timer);
  }, [jumpTarget, messages, virtualizer]);

  const onScroll = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    stick.current = distance < STICK_THRESHOLD_PX;
    setShowJump(distance > STICK_THRESHOLD_PX * 3);
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      {/* Keyed by conversation: a new node stays quiet, so switching chats announces nothing. */}
      <p key={last?.conversationId} role="status" className="sr-only">
        {outcomeOf(last)}
      </p>
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_20px,black_calc(100%-16px),transparent)] [scrollbar-gutter:stable_both-edges]" role="log" aria-label={t("Conversation")} aria-live="off">
        <div className="relative mx-auto w-full max-w-[var(--reading-width)] px-4 sm:px-6" style={{ height: totalSize + 32 }}>
          {virtualizer.getVirtualItems().map((item) => {
            const message = messages[item.index];
            if (!message) return null;
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                data-flash={message.id === flashId ? "" : undefined}
                className={`absolute inset-x-4 top-0 sm:inset-x-6 ${message.role === "tool" ? "" : messages[item.index - 1]?.role === "tool" ? "pt-2" : "pt-6"}`}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <MessageRow message={message} isLast={item.index === messages.length - 1} continued={messages[item.index - 1]?.role === "tool"} />
              </div>
            );
          })}
        </div>
      </div>
      {showJump ? (
        <button
          type="button"
          aria-label={t("Jump to latest")}
          onClick={() => {
            stick.current = true;
            scrollToEnd();
          }}
          className="press fade-in absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface-raised text-muted shadow-float [@media(hover:hover)]:hover:text-foreground"
        >
          <ArrowDown className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
