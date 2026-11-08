"use client";

import { ChevronRight } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import type { Message } from "@/types";
import { Markdown } from "../markdown/markdown";
import { useProviderStore } from "../providers/provider-store";
import { useSettingsStore } from "../settings/settings-store";
import { AttachmentList } from "./attachment-view";
import { continueMessage, editMessage, regenerate } from "./chat-actions";
import { useChatStore } from "./chat-store";
import { formatCost, formatTokens } from "@/lib/params";
import { ModelAvatar } from "./model-avatar";
import { ErrorCard } from "./error-card";
import { ToolCalls } from "./tool-calls";
import { AssistantToolbar, BranchSwitcher, UserActionsButton, UserToolbar } from "./message-toolbar";
import { t } from "@/i18n";


/** Quiet below a cent, ordinary in between, amber from the threshold the user set. */
function costTone(cost: number, threshold: number): string {
  if (threshold > 0 && cost >= threshold) return "font-medium text-warning";
  return cost < 0.01 ? "text-faint" : "text-muted";
}

function UsageLine({ message }: { message: Message }) {
  const showUsage = useSettingsStore((state) => state.settings.showUsage);
  const threshold = useSettingsStore((state) => state.settings.costHighlightAt);
  const { usage, estimatedCost } = message;
  const tokens = usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  return (
    <span className="tabular flex min-w-0 items-center gap-2.5 text-xs text-faint">
      {message.model?.host ? <span className="truncate font-mono text-[0.6875rem]">{message.model.host}</span> : null}
      {showUsage && tokens > 0 ? <span className="shrink-0">{formatTokens(tokens)} tokens</span> : null}
      {showUsage && estimatedCost !== undefined ? (
        <span className={`shrink-0 ${costTone(estimatedCost, threshold)}`} title={estimatedCost >= threshold && threshold > 0 ? t("Above the cost you chose to highlight") : undefined}>
          {formatCost(estimatedCost)}
        </span>
      ) : null}
    </span>
  );
}

/** Who answered: an avatar and the model's name, which screen readers hear as "… replied". */
function Speaker({ message }: { message: Message }) {
  if (!message.model) return <p className="sr-only select-none">{t("Assistant replied:")}</p>;
  return (
    <p className="mb-2 flex items-center gap-2 text-[0.8125rem] font-medium text-muted select-none">
      <ModelAvatar model={message.model} />
      {message.model.modelName}
      <span className="sr-only"> replied:</span>
    </p>
  );
}

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-sm py-1 pr-1.5 text-[0.8125rem] touch:min-h-11 text-muted [@media(hover:hover)]:hover:text-foreground"
      >
        <ChevronRight className={`size-3.5 transition-transform duration-150 ${open ? "rotate-90" : ""}`} aria-hidden="true" />
        {live ? t("Thinking") : t("Thought process")}
      </button>
      <div inert={!open} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="min-h-0 overflow-hidden">
          <p className="mt-1 border-l border-border-strong pl-3 text-sm whitespace-pre-wrap text-muted">{text}</p>
        </div>
      </div>
    </div>
  );
}

function StreamStatus({ phase, attempt }: { phase: string; attempt?: number }) {
  const label = phase === "retrying" ? `Retrying${attempt ? ` (${attempt} of 2)` : ""}…` : "Connecting…";
  return (
    <p role="status" className="flex items-center gap-2 py-1 text-sm text-muted">
      <span aria-hidden="true" className="caret-stream" />
      {label}
    </p>
  );
}

/** Subscribes to the live stream on its own, so tokens re-render this row and nothing else. */
function StreamingBody({ message }: { message: Message }) {
  const stream = useChatStore((state) => state.streams[message.conversationId]);
  const live = stream?.messageId === message.id ? stream : undefined;
  const text = live?.text ?? message.content;
  const reasoning = live?.reasoning ?? message.reasoning ?? "";

  return (
    <>
      {reasoning ? <Reasoning text={reasoning} live={!text} /> : null}
      {text ? <Markdown content={text} streaming /> : null}
      {live && (live.phase !== "streaming" || (!text && !reasoning)) ? <StreamStatus phase={live.phase} attempt={live.retryAttempt} /> : null}
    </>
  );
}

function FallbackNote({ message }: { message: Message }) {
  if (!message.fellBackFrom) return null;
  return (
    <p className="mt-2 text-[0.8125rem] text-muted">
      {t("{0} failed ({1}), so {2} answered instead.", { 0: message.fellBackFrom.modelName, 1: t(message.fellBackFrom.reason), 2: message.model?.modelName ?? t("your fallback model") })}</p>
  );
}

function Notice({ message, onContinue }: { message: Message; onContinue: () => void }) {
  if (message.status === "stopped") {
    return <p className="mt-2 text-[0.8125rem] text-muted">{t("Stopped.")}</p>;
  }
  if (message.finishReason === "length") {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
        {t("The response reached the token limit.")}<Button size="s" onClick={onContinue}>
          {t("Continue")}</Button>
      </div>
    );
  }
  if (message.finishReason === "refusal") {
    return <p className="mt-2 text-[0.8125rem] text-muted">{t("The model declined this request. Try rephrasing it, or use another model.")}</p>;
  }
  return null;
}

function EditBox({ message, onClose }: { message: Message; onClose: () => void }) {
  const [value, setValue] = useState(message.content);
  return (
    <div className="flex w-full flex-col gap-2">
      <Textarea aria-label={t("Edit message")} autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="s" onClick={onClose}>
          {t("Cancel")}</Button>
        <Button
          size="s"
          variant="primary"
          disabled={!value.trim()}
          onClick={() => {
            onClose();
            void editMessage(message.id, value.trim());
          }}
        >
          {t("Save and send")}</Button>
      </div>
    </div>
  );
}

const TOOLBAR = "flex items-center transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0";

interface MessageRowProps {
  message: Message;
  isLast: boolean;
  /** The answer continues after a tool round, so the speaker isn't repeated. */
  continued?: boolean;
}

export const MessageRow = memo(function MessageRow({ message, isLast, continued = false }: MessageRowProps) {
  const [editing, setEditing] = useState(false);
  const providerId = useProviderStore((state) => state.models.find((model) => model.id === message.model?.modelConfigId)?.providerId);

  // Tool results show inside the answer that asked for them, not as a row of their own.
  if (message.role === "tool") return null;

  if (message.role === "user") {
    return (
      <div className="group flex flex-col items-end gap-1">
        {message.attachments?.length ? <AttachmentList attachments={message.attachments} /> : null}
        {editing ? (
          <EditBox message={message} onClose={() => setEditing(false)} />
        ) : message.content ? (
          <div className="flex w-full items-center justify-end gap-1">
            <div className="[@media(hover:hover)]:hidden">
              <UserActionsButton message={message} onEdit={() => setEditing(true)} />
            </div>
            <div dir="auto" className="max-w-[min(85%,36rem)] rounded-md bg-surface px-3.5 py-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
              <span className="sr-only select-none">{t("You said:")}{" "}</span>
              {message.content}
            </div>
          </div>
        ) : null}
        {editing ? null : (
          <div className="flex items-center gap-1">
            <div className={`${TOOLBAR} [@media(hover:none)]:hidden`}>
              <UserToolbar message={message} isLast={isLast} onEdit={() => setEditing(true)} />
            </div>
            <BranchSwitcher message={message} />
          </div>
        )}
      </div>
    );
  }

  const streaming = message.status === "streaming";

  return (
    <div className="group">
      {continued ? null : <Speaker message={message} />}
      {streaming ? (
        <StreamingBody message={message} />
      ) : (
        <>
          {message.reasoning ? <Reasoning text={message.reasoning} live={false} /> : null}
          {message.content ? <Markdown content={message.content} /> : null}
          <ToolCalls message={message} />
          <FallbackNote message={message} />
          <Notice message={message} onContinue={() => void continueMessage(message.id)} />
          {message.error ? (
            <div className={message.content ? "mt-3" : ""}>
              <ErrorCard
                error={message.error}
                providerId={providerId}
                onRetry={() => void regenerate(message.id)}
                onContinue={message.content && message.error.code === "stream_interrupted" ? () => void continueMessage(message.id) : undefined}
              />
            </div>
          ) : null}
        </>
      )}
      {streaming ? null : (
        <div className="mt-1.5 flex min-h-7 flex-wrap items-center justify-between gap-x-2">
          <div className="-ml-1.5 flex items-center gap-1">
            <BranchSwitcher message={message} />
            {/* A failed reply with no text has nothing to copy or save. Its card holds the actions. */}
            {message.content ? (
              <div className={TOOLBAR}>
                <AssistantToolbar message={message} isLast={isLast} />
              </div>
            ) : null}
          </div>
          <UsageLine message={message} />
        </div>
      )}
    </div>
  );
});
