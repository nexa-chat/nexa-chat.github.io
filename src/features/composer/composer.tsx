"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { PromptInput, type PromptAttachment } from "@/components/ui/ai-chat-input";
import { useActiveContext } from "@/hooks/use-active-model";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useOnline } from "@/hooks/use-online";
import { COMPOSER_INPUT_ID } from "@/hooks/use-shortcuts";
import { GENERATION_PRESETS, estimateCost, estimateTokens, formatCost, formatTokens } from "@/lib/params";
import { ACCEPTED_FILES, formatBytes } from "@/services/files";
import { templateVariables } from "@/services/templates";
import type { PresetId } from "@/types";
import { sendMessage, stopGeneration } from "../chat/chat-actions";
import { useChatStore } from "../chat/chat-store";
import { useSettingsStore } from "../settings/settings-store";
import { ModelSelector, useGenerationPreset } from "./model-selector";
import { useAttachments } from "./use-attachments";
import { useVoiceInput } from "./use-voice-input";
import { SLASH_LIST_ID, SlashMenu, matchCommands, slashOptionId, useSlashCommands, type SlashCommand } from "./slash-commands";
import { VariableDialog } from "./variable-dialog";
import { Wire } from "./wire";
import { t } from "@/i18n";


const EFFORT_CYCLE: readonly PresetId[] = ["fast", "balanced", "reasoning"];

function typeLabel(mimeType: string): string {
  return mimeType.split("/")[1]?.split(".").pop()?.toUpperCase().slice(0, 8) ?? "FILE";
}

export function Composer() {
  const { model, provider } = useActiveContext();
  const activeId = useChatStore((state) => state.activeId);
  const generating = useChatStore((state) => (activeId ? activeId in state.streams : false));
  const enterBehavior = useSettingsStore((state) => state.settings.enterBehavior);
  const online = useOnline();
  // A phone keyboard has no Shift+Enter, so Enter adds a line and the button sends.
  const touch = useMediaQuery("(pointer: coarse)");
  const { presetId, setPreset } = useGenerationPreset();

  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const { items, processing, add, remove, take } = useAttachments(model?.capabilities, model?.name);
  const history = useChatStore((state) => state.messages);
  const historyCharacters = useMemo(
    () => history.reduce((total, message) => total + message.content.length + (message.attachments?.reduce((sum, file) => sum + (file.extractedText?.length ?? 0), 0) ?? 0), 0),
    [history],
  );
  const voice = useVoiceInput(text, setText);

  const noVision = model !== undefined && !model.capabilities.supportsVision;
  const hasUnsupported = noVision && items.some((item) => item.attachment.kind === "image");
  const ready = model !== undefined && provider !== undefined;
  const canSend = ready && online && !generating && processing === 0 && !hasUnsupported && (text.trim().length > 0 || items.length > 0);
  const open = focused || text.length > 0 || items.length > 0 || generating || voice.recording;

  // What the next request will roughly weigh: the whole chat is sent again with each message.
  const pendingCharacters = text.length + items.reduce((sum, item) => sum + (item.attachment.extractedText?.length ?? 0), 0);
  const estimate = pendingCharacters > 0 && model ? estimateTokens(historyCharacters + pendingCharacters) : undefined;
  const estimatedCost = estimate === undefined ? undefined : estimateCost({ inputTokens: estimate }, model?.pricing);
  const meta =
    estimate === undefined ? undefined : (
      <span title={t("An estimate of what this message sends, the chat so far included. The answer adds to it. Images aren't counted.")}>
        ≈{formatTokens(estimate)} tokens{estimatedCost === undefined ? "" : ` · ${formatCost(estimatedCost)}`}
      </span>
    );

  // Slash commands: "/" alone on the first line opens a list of prompts to start from.
  const slashQuery = /^\/([^\s/]*)$/.exec(text)?.[1];
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [selection, setSelection] = useState({ query: "", index: 0 });
  const commands = useSlashCommands(slashQuery !== undefined);
  const matches = slashQuery === undefined ? [] : matchCommands(commands, slashQuery);
  const slashOpen = matches.length > 0 && dismissedAt !== text;
  const slashIndex = selection.query === slashQuery ? Math.min(selection.index, matches.length - 1) : 0;
  const [filling, setFilling] = useState<SlashCommand | null>(null);

  const focusComposer = (): void => {
    requestAnimationFrame(() => {
      const input = document.getElementById(COMPOSER_INPUT_ID) as HTMLTextAreaElement | null;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  };

  const applyCommand = (command: SlashCommand): void => {
    if (templateVariables(command.template).length > 0) {
      setFilling(command);
      return;
    }
    setText(t(command.template));
    focusComposer();
  };

  const submit = useCallback(() => {
    if (!canSend) return;
    const message = text.trim();
    setText("");
    void sendMessage(message, take());
  }, [canSend, text, take]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slashOpen && !event.nativeEvent.isComposing) {
      const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      if (step !== 0) {
        event.preventDefault();
        setSelection({ query: slashQuery ?? "", index: (slashIndex + step + matches.length) % matches.length });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const command = matches[slashIndex];
        if (command) {
          event.preventDefault();
          applyCommand(command);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedAt(text);
        return;
      }
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing || touch) return;
    const sendKey = enterBehavior === "send" ? !event.shiftKey : event.ctrlKey || event.metaKey;
    if (sendKey) {
      event.preventDefault();
      submit();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...event.clipboardData.files];
    if (files.length > 0) {
      event.preventDefault();
      void add(files);
    }
  };

  // Files can be dropped anywhere in the chat, not only on the composer.
  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes("Files") ?? false;
    const onEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent): void => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onLeave = (): void => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent): void => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (event.dataTransfer?.files.length) void add([...event.dataTransfer.files]);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [add]);

  const attachments = useMemo<PromptAttachment[]>(
    () =>
      items.map(({ attachment, previewUrl }) => {
        const unsupported = attachment.kind === "image" && noVision;
        return {
          id: attachment.id,
          name: attachment.name,
          previewUrl,
          unsupported,
          detail: unsupported ? t("Not readable by this model") : `${typeLabel(attachment.mimeType)}, ${formatBytes(attachment.size)}`,
        };
      }),
    [items, noVision],
  );

  const level = EFFORT_CYCLE.indexOf(presetId);
  const presetLabel = t(GENERATION_PRESETS.find((preset) => preset.id === presetId)?.label ?? "Balanced");
  const placeholder = !online ? t("You're offline.") : ready ? t("Ask anything") : t("Add a provider to start chatting");
  const accept = noVision ? ACCEPTED_FILES.split(",").filter((type) => !/png|jpe?g|webp/.test(type)).join(",") : ACCEPTED_FILES;

  return (
    <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[var(--overlay)]">
          <p className="rounded-lg border border-dashed border-accent bg-surface-raised px-8 py-6 font-display text-lg font-medium">{t("Drop files here")}</p>
        </div>
      ) : null}

      <input
        ref={filePicker}
        type="file"
        name="attachments"
        multiple
        hidden
        accept={accept}
        onChange={(event) => {
          void add([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      <div className="relative mx-auto w-full max-w-[var(--reading-width)] px-3 pt-2 sm:px-5">
        {slashOpen ? <SlashMenu commands={matches} activeIndex={slashIndex} onPick={applyCommand} onHover={(index) => setSelection({ query: slashQuery ?? "", index })} /> : null}
        <PromptInput
          inputId={COMPOSER_INPUT_ID}
          value={text}
          onChange={setText}
          onSubmit={submit}
          onStop={() => stopGeneration(activeId)}
          placeholder={placeholder}
          enterKeyHint={enterBehavior === "send" && !touch ? "send" : "enter"}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          open={open}
          onOpenChange={setFocused}
          canSubmit={canSend}
          generating={generating}
          disabled={!ready}
          attachments={attachments}
          onAttach={() => filePicker.current?.click()}
          onRemoveAttachment={remove}
          modelControl={<ModelSelector disabled={!ready} />}
          meta={meta}
          textareaAria={
            slashOpen
              ? { "aria-controls": SLASH_LIST_ID, "aria-autocomplete": "list", "aria-expanded": true, "aria-activedescendant": matches[slashIndex] ? slashOptionId(matches[slashIndex]) : undefined }
              : undefined
          }
          effort={{
            label: presetLabel,
            level: level === -1 ? 1 : (level as 0 | 1 | 2),
            onCycle: () => setPreset(EFFORT_CYCLE[(level + 1) % EFFORT_CYCLE.length] ?? "balanced"),
          }}
          voice={voice}
        />
      </div>

      {provider ? <Wire provider={provider} attached={open} /> : <div className="h-3" />}
      {filling ? (
        <VariableDialog
          title={`/${filling.name}`}
          template={t(filling.template)}
          onClose={() => setFilling(null)}
          onDone={(filled) => {
            setFilling(null);
            setText(filled);
            focusComposer();
          }}
        />
      ) : null}
    </div>
  );
}
