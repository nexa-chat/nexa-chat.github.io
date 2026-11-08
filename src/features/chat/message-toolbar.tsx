"use client";

import { Check, ChevronLeft, ChevronRight, Columns2, Copy, GitCompareArrows, ImageDown, MoreHorizontal, Pencil, Pin, PinOff, Play, RefreshCw, Square, Star, Trash2, Volume2 } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { currentlySpeaking, speak, speechSupported, stopSpeaking, subscribeSpeech } from "@/services/speech";
import { IconButton } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { SwapIcon } from "@/components/ui/swap-icon";
import { useCopy } from "@/hooks/use-copy";
import { isSaved } from "@/services/branches";
import type { Message } from "@/types";
import { CHAT_ACTIONS, continueMessage, deleteMessage, regenerate, resend, runChatAction, switchBranch, togglePinned, toggleSaved } from "./chat-actions";
import { shareAnswerAsImage } from "./share-image";
import { useProviderStore } from "../providers/provider-store";
import { useChatStore } from "./chat-store";
import { CompareDialog } from "./compare-dialog";
import { t } from "@/i18n";

async function confirmDeleteMessage(id: string): Promise<void> {
  const confirmed = await confirmAction({ title: t("Delete this message?"), message: t("It will be removed from this chat. This can't be undone."), confirmLabel: t("Delete message"), danger: true });
  if (confirmed) await deleteMessage(id);
}

/** Stays visible, unlike the toolbar: it's the only sign that other versions exist. */
export function BranchSwitcher({ message }: { message: Message }) {
  const versions = useChatStore((state) => state.forks[message.id]);
  const busy = useChatStore((state) => state.streams[message.conversationId] !== undefined);
  const [comparing, setComparing] = useState(false);
  if (!versions) return null;

  const index = versions.indexOf(message.id);
  const previous = versions[index - 1];
  const next = versions[index + 1];

  return (
    <div role="group" aria-label={t("Versions of this message")} className="flex shrink-0 items-center text-xs text-muted">
      <IconButton size="s" label={t("Previous version")} disabled={busy || !previous} onClick={() => previous && void switchBranch(previous)}>
        <ChevronLeft className="size-3.5" />
      </IconButton>
      <span className="tabular min-w-7 text-center">
        <span className="sr-only">{t("Version")}{" "}</span>
        {index + 1}
        <span aria-hidden="true">/</span>
        <span className="sr-only"> of </span>
        {versions.length}
      </span>
      <IconButton size="s" label={t("Next version")} disabled={busy || !next} onClick={() => next && void switchBranch(next)}>
        <ChevronRight className="size-3.5" />
      </IconButton>
      {message.role === "assistant" ? (
        <>
          <IconButton size="s" label={t("Compare versions side by side")} disabled={busy} onClick={() => setComparing(true)}>
            <Columns2 className="size-3.5" />
          </IconButton>
          <CompareDialog open={comparing} onClose={() => setComparing(false)} versionIds={versions} currentId={message.id} />
        </>
      ) : null}
    </div>
  );
}

function PinButton({ message }: { message: Message }) {
  return (
    <IconButton size="s" label={message.pinned ? t("Unpin") : t("Pin to the top of this chat")} aria-pressed={Boolean(message.pinned)} onClick={() => void togglePinned(message)}>
      {message.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
    </IconButton>
  );
}

const noSpeech = (): string | null => null;

/** Read aloud with the device's voices. Hidden where the browser has none. */
function ReadAloudButton({ message }: { message: Message }) {
  const speaking = useSyncExternalStore(subscribeSpeech, currentlySpeaking, noSpeech) === message.id;
  const supported = useSyncExternalStore(subscribeSpeech, speechSupported, () => false);
  if (!supported) return null;
  return (
    <IconButton size="s" label={speaking ? t("Stop reading") : t("Read aloud")} aria-pressed={speaking} onClick={() => (speaking ? stopSpeaking() : speak(message.id, message.content))}>
      {speaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
    </IconButton>
  );
}

interface ToolbarProps {
  message: Message;
  isLast: boolean;
  onEdit?: () => void;
}

export function UserToolbar({ message, onEdit }: ToolbarProps) {
  const { copied, copy } = useCopy();
  return (
    <>
      <IconButton size="s" label={copied ? t("Copied") : t("Copy")} onClick={() => void copy(message.content)}>
        <SwapIcon swapped={copied} from={<Copy className="size-3.5" />} to={<Check className="size-3.5 text-success" />} />
      </IconButton>
      <IconButton size="s" label={t("Edit")} onClick={onEdit}>
        <Pencil className="size-3.5" />
      </IconButton>
      <PinButton message={message} />
      <IconButton size="s" label={t("Retry")} onClick={() => void resend(message.id)}>
        <RefreshCw className="size-3.5" />
      </IconButton>
      {/* Set apart so it can't be hit by accident. */}
      <IconButton size="s" label={t("Delete")} className="ml-4" onClick={() => void confirmDeleteMessage(message.id)}>
        <Trash2 className="size-3.5" />
      </IconButton>
    </>
  );
}

/** Touch screens have no hover, so a visible button opens the same actions as a sheet. */
export function UserActionsButton({ message, onEdit }: { message: Message; onEdit: () => void }) {
  const { copy } = useCopy();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const items: MenuItem[] = [
    { id: "copy", label: t("Copy"), icon: <Copy />, onSelect: () => void copy(message.content) },
    { id: "edit", label: t("Edit"), icon: <Pencil />, onSelect: onEdit },
    { id: "pin", label: message.pinned ? t("Unpin") : t("Pin"), icon: message.pinned ? <PinOff /> : <Pin />, onSelect: () => void togglePinned(message) },
    { id: "retry", label: t("Retry"), icon: <RefreshCw />, onSelect: () => void resend(message.id) },
    { id: "delete", label: t("Delete"), icon: <Trash2 />, danger: true, separated: true, onSelect: () => void confirmDeleteMessage(message.id) },
  ];

  return (
    <>
      <IconButton ref={button} size="s" label={t("Message actions")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal className="size-4" />
      </IconButton>
      <Menu open={open} onClose={() => setOpen(false)} anchorRef={button} items={items} label={t("Message actions")} width={176} />
    </>
  );
}

export function AssistantToolbar({ message, isLast }: ToolbarProps) {
  const { copied, copy } = useCopy();
  const [menuOpen, setMenuOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const compareButton = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const models = useProviderStore((state) => state.models);
  const saved = isSaved(message);

  // Ask the same question to another model. The answer becomes another version, to compare.
  const otherModels: MenuItem[] = models
    .filter((model) => model.id !== message.model?.modelConfigId)
    .map((model) => ({ id: model.id, label: model.name, onSelect: () => void regenerate(message.id, model.id) }));

  const items: MenuItem[] = [
    ...(isLast ? CHAT_ACTIONS.map((action) => ({ id: action.id, label: t(action.label), onSelect: () => void runChatAction(action.id) })) : []),
    {
      id: "image",
      label: t("Share as image"),
      icon: <ImageDown />,
      separated: isLast,
      onSelect: () => {
        const { messages } = useChatStore.getState();
        const index = messages.findIndex((item) => item.id === message.id);
        void shareAnswerAsImage(message, messages[index - 1]?.role === "user" ? messages[index - 1] : undefined);
      },
    },
    {
      id: "delete",
      label: t("Delete"),
      icon: <Trash2 />,
      danger: true,
      onSelect: () => void confirmDeleteMessage(message.id),
    },
  ];

  return (
    <>
      <IconButton size="s" label={copied ? t("Copied") : t("Copy")} onClick={() => void copy(message.content)}>
        <SwapIcon swapped={copied} from={<Copy className="size-3.5" />} to={<Check className="size-3.5 text-success" />} />
      </IconButton>
      <IconButton size="s" label={saved ? t("Remove from saved answers") : t("Save answer")} aria-pressed={saved} onClick={() => void toggleSaved(message)}>
        <Star className={`size-3.5 ${saved ? "text-warning" : ""}`} fill={saved ? "currentColor" : "none"} />
      </IconButton>
      <PinButton message={message} />
      <ReadAloudButton message={message} />
      <IconButton size="s" label={t("Regenerate")} onClick={() => void regenerate(message.id)}>
        <RefreshCw className="size-3.5" />
      </IconButton>
      {isLast ? (
        <IconButton size="s" label={t("Continue")} onClick={() => void continueMessage(message.id)}>
          <Play className="size-3.5" />
        </IconButton>
      ) : null}
      {otherModels.length > 0 ? (
        <>
          <IconButton ref={compareButton} size="s" label={t("Ask another model")} aria-haspopup="menu" aria-expanded={pickerOpen} onClick={() => setPickerOpen((open) => !open)}>
            <GitCompareArrows className="size-3.5" />
          </IconButton>
          <Menu open={pickerOpen} onClose={() => setPickerOpen(false)} anchorRef={compareButton} items={otherModels} label={t("Ask another model")} width={240} />
        </>
      ) : null}
      <IconButton ref={moreButton} size="s" label={t("More actions")} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
        <MoreHorizontal className="size-3.5" />
      </IconButton>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={moreButton} items={items} label={t("More actions")} width={176} />
    </>
  );
}
