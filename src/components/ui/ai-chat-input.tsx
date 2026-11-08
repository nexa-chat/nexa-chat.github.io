"use client";

import { ArrowUp, FileText, Mic, Plus, Square, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

/*
 * Adapted from 21st.dev's ai-chat-input. It keeps the morphing pill, the attachment tab, the
 * shared-element gallery and the action button that changes shape. It holds no chat logic:
 * NEXA's composer drives it, so models, files and voice are all real.
 */

const SPRING = "cubic-bezier(0.175, 0.885, 0.32, 1.275)";
const SPRING_RESIZE = `max-width 0.4s ${SPRING}, height 0.4s ${SPRING}, border-color 0.1s`;
const QUICK_RESIZE = `max-width 0.4s ${SPRING}, height 0.15s ease-out, border-color 0.1s`;

const MIN_TEXT_HEIGHT = 68;
const MAX_TEXT_HEIGHT = 160;

export function MorphingText({ text, className }: { text: string; className?: string }) {
  const [width, setWidth] = useState<number | "auto">("auto");
  const measure = useRef<HTMLSpanElement>(null);

  // Observed, not measured once: the web font can arrive after the first layout.
  useEffect(() => {
    const element = measure.current;
    if (!element) return;
    // offsetWidth rounds down, which clips the last letter. Round the real width up instead.
    const observer = new ResizeObserver(() => setWidth(Math.ceil(element.getBoundingClientRect().width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <span className={cn("relative inline-flex items-center overflow-hidden transition-[width] duration-300 ease-out", className)} style={{ width }}>
      <span ref={measure} aria-hidden="true" className="invisible whitespace-nowrap">
        {text}
      </span>
      <span key={text} className="absolute inset-0 truncate animate-in fade-in zoom-in-95 duration-300">
        {text}
      </span>
    </span>
  );
}

function EffortBars({ level }: { level: 0 | 1 | 2 }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="8" width="2.5" height="4.5" rx="1" fill="currentColor" />
      <rect x="5.75" y="5" width="2.5" height="7.5" rx="1" fill="currentColor" className="transition-opacity duration-300" opacity={level >= 1 ? 1 : 0.3} />
      <rect x="10" y="2" width="2.5" height="10.5" rx="1" fill="currentColor" className="transition-opacity duration-300" opacity={level >= 2 ? 1 : 0.3} />
    </svg>
  );
}

export interface PromptAttachment {
  id: string;
  name: string;
  /** Type and size, or why this model can't read the file. */
  detail: string;
  previewUrl?: string;
  unsupported?: boolean;
}

function AttachmentChip({ item, index, onRemove, onOpen }: { item: PromptAttachment; index: number; onRemove: () => void; onOpen: (rect: DOMRect) => void }) {
  return (
    <div
      style={{ animationDelay: `${index * 35}ms`, animationFillMode: "backwards" }}
      className={cn("flex h-12 max-w-[15rem] shrink-0 items-center gap-2 rounded-md border bg-surface py-1 pr-1 pl-1 animate-in fade-in slide-in-from-top-3 zoom-in-90 duration-300", item.unsupported ? "border-danger/60" : "border-border")}
    >
      {item.previewUrl ? (
        <button
          type="button"
          aria-label={t("Preview {0}", { 0: item.name })}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => onOpen(event.currentTarget.getBoundingClientRect())}
          className="press size-10 shrink-0 overflow-hidden rounded-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview from a blob URL */}
          <img src={item.previewUrl} alt="" className="size-full object-cover" draggable={false} />
        </button>
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-hover text-muted">
          <FileText className="size-4" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[0.8125rem] leading-tight">{item.name}</span>
        <span className={cn("tabular block truncate text-xs leading-tight", item.unsupported ? "text-danger" : "text-muted")}>{item.detail}</span>
      </span>
      <button
        type="button"
        aria-label={t("Remove {0}", { 0: item.name })}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
        className="press flex size-7 shrink-0 items-center justify-center rounded-sm text-muted touch:size-11 [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
}

/** The thumbnail grows into the full image, and shrinks back to where it came from. */
function AttachmentGallery({ item, origin, onClose }: { item: PromptAttachment; origin: DOMRect; onClose: () => void }) {
  const [target, setTarget] = useState<Box | null>(null);
  const [closing, setClosing] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const image = useRef<HTMLImageElement>(null);

  const measure = useCallback(() => {
    const natural = image.current;
    const naturalWidth = natural?.naturalWidth || 800;
    const naturalHeight = natural?.naturalHeight || 600;
    const scale = Math.min(Math.min(window.innerWidth * 0.86, 560) / naturalWidth, Math.min(window.innerHeight * 0.78, 720) / naturalHeight, 1.6);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    requestAnimationFrame(() => setTarget({ top: (window.innerHeight - height) / 2, left: (window.innerWidth - width) / 2, width, height, radius: 16 }));
  }, []);

  const close = useCallback(() => setClosing(true), []);

  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [close]);

  const open = target !== null && !closing;
  const box: Box = open ? target : { top: origin.top, left: origin.left, width: origin.width, height: origin.height, radius: 6 };
  const timing = closing ? "0.3s ease-out" : `0.45s ${SPRING}`;
  const style: CSSProperties = {
    position: "fixed",
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    borderRadius: box.radius,
    overflow: "hidden",
    transition: ["top", "left", "width", "height", "border-radius"].map((property) => `${property} ${timing}`).join(", "),
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={item.name} className="fixed inset-0 z-[100]" onClick={close}>
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm transition-opacity duration-300" style={{ opacity: open ? 1 : 0 }} />
      <div
        style={style}
        className="bg-surface"
        onClick={(event) => event.stopPropagation()}
        onTransitionEnd={(event) => {
          if (closing && event.propertyName === "width") onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local preview from a blob URL */}
        <img ref={image} src={item.previewUrl} alt={item.name} onLoad={measure} className="size-full object-cover" draggable={false} />
      </div>
      <button
        ref={closeButton}
        type="button"
        aria-label={t("Close preview")}
        onClick={close}
        style={{ opacity: open ? 1 : 0 }}
        className="press fixed top-[calc(1rem+env(safe-area-inset-top))] right-4 flex size-11 items-center justify-center rounded-full bg-surface-raised text-foreground shadow-float transition-opacity duration-300"
      >
        <X className="size-4" />
      </button>
    </div>,
    document.body,
  );
}

export interface PromptInputProps {
  inputId: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  placeholder: string;
  enterKeyHint: "send" | "enter";
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  /** Extra ARIA for the textarea, such as a suggestion list it controls. */
  textareaAria?: { "aria-controls"?: string; "aria-activedescendant"?: string; "aria-autocomplete"?: "list"; "aria-expanded"?: boolean };
  /** Whether the card is open. The composer owns this, because the wire follows it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canSubmit: boolean;
  generating: boolean;
  disabled: boolean;
  attachments: readonly PromptAttachment[];
  onAttach: () => void;
  onRemoveAttachment: (id: string) => void;
  modelControl: ReactNode;
  /** A short note in the toolbar, such as the estimated size of the next request. */
  meta?: ReactNode;
  effort: { label: string; level: 0 | 1 | 2; onCycle: () => void };
  voice: { supported: boolean; recording: boolean; levels: readonly number[]; start: () => void; stop: () => void };
}

export function PromptInput(props: PromptInputProps) {
  const { inputId, value, onChange, onSubmit, onStop, placeholder, enterKeyHint, onKeyDown, onPaste, open, onOpenChange, canSubmit, generating, disabled, attachments, onAttach, onRemoveAttachment, modelControl, meta, effort, voice, textareaAria } = props;

  const mobile = useIsMobile();
  const root = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const topFade = useRef<HTMLDivElement>(null);
  const bottomFade = useRef<HTMLDivElement>(null);

  const [typing, setTyping] = useState(false);
  const [textHeight, setTextHeight] = useState(MIN_TEXT_HEIGHT);
  const [scrolls, setScrolls] = useState(false);
  const [gallery, setGallery] = useState<{ item: PromptAttachment; rect: DOMRect } | null>(null);

  const actionsHeight = mobile ? 58 : 48;
  const closedHeight = mobile ? 52 : 48;
  const hasAttachments = attachments.length > 0;

  const updateFades = useCallback(() => {
    const element = textarea.current;
    if (!element) return;
    const { scrollTop, scrollHeight, clientHeight } = element;
    if (topFade.current) topFade.current.style.opacity = String(Math.min(scrollTop / 20, 1));
    if (bottomFade.current) bottomFade.current.style.opacity = String(Math.min(Math.max(scrollHeight - clientHeight - scrollTop - 16, 0) / 10, 1));
  }, []);

  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    const previous = element.style.height;
    element.style.transition = "none";
    element.style.height = "0px";
    const { scrollHeight } = element;
    element.style.height = previous;
    void element.offsetHeight;
    element.style.transition = "";

    const next = Math.max(MIN_TEXT_HEIGHT, Math.min(scrollHeight, MAX_TEXT_HEIGHT));
    element.style.height = `${next}px`;
    setTextHeight(next);
    setScrolls(scrollHeight > MAX_TEXT_HEIGHT);
    updateFades();
  }, [value, open, updateFades]);

  const expand = (): void => {
    setTyping(false);
    onOpenChange(true);
    textarea.current?.focus();
  };

  // Focus can move to a sheet or popover that belongs to the composer: that isn't leaving.
  const onBlur = (): void => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (root.current?.contains(active) || active?.closest("[data-composer-layer]")) return;
      setTyping(false);
      onOpenChange(false);
    });
  };

  const showSend = canSubmit && !generating && !voice.recording;
  const showStop = generating || voice.recording;
  const showMic = !showSend && !showStop && voice.supported && !disabled;
  const actionLabel = generating ? t("Stop generating") : voice.recording ? t("Stop dictation") : showMic ? t("Dictate a message") : t("Send message");
  const actionEnabled = showSend || showStop || showMic;

  const onAction = (): void => {
    if (generating) onStop();
    else if (voice.recording) voice.stop();
    else if (showSend) onSubmit();
    else if (showMic) voice.start();
  };

  const morph = (visible: boolean, turn: string): string =>
    cn("absolute inset-0 flex items-center justify-center transition-[opacity,transform,filter] duration-300", visible ? "scale-100 rotate-0 opacity-100" : cn("scale-50 opacity-0 blur-[1px]", turn));
  const pill = "press flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-muted transition-colors duration-100 touch:min-h-11 [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-foreground";

  return (
    <>
      <div
        ref={root}
        onBlur={onBlur}
        className="relative mx-auto flex w-full flex-col"
        style={{ maxWidth: open ? "100%" : 420, transition: typing ? "max-width 0.15s ease-out" : `max-width 0.4s ${SPRING}` }}
      >
        {/* The attachment tab slides out from behind the card. */}
        <div className="relative z-0 w-full overflow-hidden" style={{ height: hasAttachments && open ? 68 : 0, transition: `height 0.4s ${SPRING}` }}>
          <ul
            aria-label={t("Files to send")}
            className="absolute inset-x-5 -bottom-2 flex h-[68px] items-start gap-2 overflow-x-auto overscroll-x-contain rounded-t-lg border border-b-0 border-border bg-surface-hover px-2 pt-2 pb-1"
            style={{ transform: hasAttachments && open ? "translateY(0)" : "translateY(100%)", opacity: hasAttachments && open ? 1 : 0, transition: `transform 0.4s ${SPRING}, opacity 0.3s ease-out` }}
          >
            {attachments.map((item, index) => (
              <li key={item.id}>
                <AttachmentChip item={item} index={index} onRemove={() => onRemoveAttachment(item.id)} onOpen={(rect) => setGallery({ item, rect })} />
              </li>
            ))}
          </ul>
        </div>

        <div
          onMouseDown={(event) => {
            if (open && event.target !== textarea.current && !voice.recording) {
              event.preventDefault();
              textarea.current?.focus();
            }
          }}
          data-state={generating ? "generating" : disabled ? "disabled" : "normal"}
          style={{ borderRadius: 24, height: open ? Math.max(MIN_TEXT_HEIGHT + actionsHeight, textHeight + actionsHeight) : closedHeight, transition: typing ? QUICK_RESIZE : SPRING_RESIZE, overflow: open ? "visible" : "hidden" }}
          className={cn("relative z-10 w-full border bg-surface shadow-float", open || generating ? "border-accent" : "border-border [@media(hover:hover)]:hover:border-border-strong", open ? "cursor-text" : "cursor-pointer", disabled && "opacity-70")}
        >
          <textarea
            ref={textarea}
            id={inputId}
            dir="auto"
            name="message"
            value={value}
            disabled={disabled || voice.recording}
            placeholder={placeholder}
            aria-label={t("Message")}
            {...textareaAria}
            enterKeyHint={enterKeyHint}
            onChange={(event) => {
              setTyping(true);
              onChange(event.target.value);
            }}
            onFocus={() => onOpenChange(true)}
            onScroll={updateFades}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !value.trim() && !hasAttachments) {
                onOpenChange(false);
                event.currentTarget.blur();
                return;
              }
              onKeyDown(event);
            }}
            onPaste={onPaste}
            style={{ transition: typing ? "height 0.15s ease-out" : `opacity 0.3s ease-out, height 0.4s ${SPRING}` }}
            className={cn(
              "absolute inset-x-0 top-0 z-[1] w-full resize-none bg-transparent py-3.5 pr-12 pl-4 text-sm leading-[22px] outline-none disabled:cursor-not-allowed",
              open ? "opacity-100" : "pointer-events-none opacity-0",
              scrolls ? "overflow-y-auto" : "overflow-y-hidden",
            )}
          />

          <div ref={topFade} className="pointer-events-none absolute inset-x-4 top-0 z-[2] h-8 bg-gradient-to-b from-surface to-transparent opacity-0" />
          <div ref={bottomFade} className="pointer-events-none absolute inset-x-4 z-[2] h-8 bg-gradient-to-t from-surface to-transparent opacity-0" style={{ top: textHeight - 32 }} />

          <button
            type="button"
            tabIndex={open ? -1 : 0}
            disabled={disabled}
            onClick={expand}
            className={cn("absolute inset-0 z-[1] truncate py-3 pr-12 pl-4 text-left text-sm font-medium text-faint transition-opacity duration-200 disabled:cursor-not-allowed", open ? "pointer-events-none opacity-0" : "opacity-100")}
          >
            {placeholder}
          </button>

          <div className={cn("absolute right-12 bottom-1.5 left-2 z-[10] flex min-w-0 items-center gap-0.5 transition-[opacity,translate,filter] duration-300 max-md:right-14", open && !voice.recording ? "translate-y-0 opacity-100 blur-none" : "pointer-events-none translate-y-2 opacity-0 blur-sm")}>
            <div className="min-w-0">{modelControl}</div>
            <button type="button" title={t("Response style")} onMouseDown={(event) => event.preventDefault()} onClick={effort.onCycle} className={pill}>
              <EffortBars level={effort.level} />
              <MorphingText text={effort.label} className="max-sm:hidden" />
              <span className="sr-only sm:hidden">{t("Response style:")}{" "}{effort.label}</span>
            </button>
            {meta ? <span className="ml-1.5 min-w-0 truncate text-[11px] text-faint tabular-nums max-sm:hidden">{meta}</span> : null}
            <button type="button" aria-label={t("Attach files")} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onAttach} className={cn(pill, "ml-auto size-7 justify-center px-0 disabled:opacity-45 touch:size-11")}>
              <Plus className="size-4" />
            </button>
          </div>

          <div aria-hidden="true" className={cn("absolute right-12 bottom-2 z-[10] flex h-8 items-center justify-end gap-[3px] transition-[opacity,translate] duration-300 max-md:right-14", voice.recording ? "w-16 translate-x-0 opacity-100" : "pointer-events-none w-0 translate-x-4 opacity-0")}>
            {voice.levels.map((level, band) => (
              // Bands are positional and never reorder.
              <div key={band} className="w-1 rounded-full bg-accent transition-[height] duration-75 ease-out" style={{ height: Math.max(4, level * 24) }} />
            ))}
          </div>

          <button
            type="button"
            aria-label={actionLabel}
            title={actionLabel}
            disabled={!actionEnabled}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={onAction}
            className={cn("press absolute right-2 bottom-2 z-[10] flex size-8 items-center justify-center rounded-full transition-colors duration-200 max-md:right-1 max-md:bottom-1 touch:size-11", actionEnabled ? "bg-primary text-on-primary [@media(hover:hover)]:hover:bg-primary-hover" : "bg-surface-hover text-faint")}
          >
            <span className="relative flex size-full items-center justify-center">
              <span className={morph(!showStop && !showMic, "rotate-45")}>
                <ArrowUp className="size-4" />
              </span>
              <span className={morph(showMic, "-rotate-45")}>
                <Mic className="size-4" />
              </span>
              <span className={morph(showStop, "rotate-45")}>
                <Square className="size-3" fill="currentColor" />
              </span>
            </span>
          </button>
        </div>
      </div>

      {gallery ? <AttachmentGallery item={gallery.item} origin={gallery.rect} onClose={() => setGallery(null)} /> : null}
    </>
  );
}
