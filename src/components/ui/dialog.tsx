"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./button";
import { t } from "@/i18n";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "s" | "m" | "l" | "xl";
  footer?: ReactNode;
}

const WIDTHS = { s: "max-w-md", m: "max-w-xl", l: "max-w-3xl", xl: "max-w-6xl" };

/** Built on <dialog>: focus trapping, Escape and the inert background come from the browser. */
export function Dialog({ open, onClose, title, description, children, size = "m", footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Don't land on the close button: use the marked field, or the dialog itself.
      (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? dialog).focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`dialog-enter m-auto w-[calc(100%-2rem)] outline-none ${WIDTHS[size]} max-h-[min(44rem,calc(100dvh-2rem))] overflow-hidden rounded-lg border border-border bg-surface-raised p-0 shadow-float open:flex open:flex-col max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]`}
    >
      {open ? (
        <>
          <header className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            <IconButton label={t("Close")} size="s" onClick={onClose} className="-mt-0.5 -mr-1">
              <X className="size-4" />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer ? <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer> : null}
        </>
      ) : null}
    </dialog>
  );
}
