"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";
import { useIsMobile } from "@/hooks/use-media-query";

interface Position {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight: number;
  origin: string;
}

function placeNear(anchor: DOMRect, width: number, height: number): Position {
  const margin = 8;
  const below = window.innerHeight - anchor.bottom - margin;
  const above = anchor.top - margin;
  const openUp = below < Math.min(height, 240) && above > below;
  const alignRight = anchor.left + width > window.innerWidth - margin;
  const horizontal = alignRight ? { right: Math.max(margin, window.innerWidth - anchor.right) } : { left: Math.max(margin, anchor.left) };

  return {
    ...(openUp ? { bottom: window.innerHeight - anchor.top + 6 } : { top: anchor.bottom + 6 }),
    ...horizontal,
    maxHeight: Math.max(160, (openUp ? above : below) - 6),
    origin: `${openUp ? "bottom" : "top"} ${alignRight ? "right" : "left"}`,
  };
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  width?: number;
  children: ReactNode;
  label: string;
  role?: "menu" | "dialog";
}

/** On a phone a small floating panel is hard to reach, so it becomes a sheet you can drag away. */
function BottomSheet({ open, onClose, anchorRef, children, label, role }: PopoverProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  // Stay inside an open <dialog>: anything outside the top layer would sit behind it.
  useLayoutEffect(() => {
    setHost(open ? (anchorRef.current?.closest("dialog") ?? null) : null);
  }, [open, anchorRef]);

  return (
    <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()} repositionInputs={false}>
      <Drawer.Portal container={host ?? undefined}>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <Drawer.Content
          data-composer-layer
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-lg border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom)] outline-none"
        >
          <Drawer.Title className="sr-only">{label}</Drawer.Title>
          <div aria-hidden="true" className="mx-auto mt-2.5 mb-1.5 h-1 w-9 shrink-0 rounded-full bg-border-strong" />
          {role === "menu" ? (
            <div role="menu" aria-label={label} className="flex min-h-0 flex-col">
              {children}
            </div>
          ) : (
            children
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function Popover(props: PopoverProps) {
  const mobile = useIsMobile();
  return mobile ? <BottomSheet {...props} /> : <FloatingPanel {...props} />;
}

/** A floating panel placed against its trigger, rendered in a portal so nothing clips it. */
function FloatingPanel({ open, onClose, anchorRef, width = 220, children, label, role = "dialog" }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ position: Position; host: Element } | null>(null);

  // Placement has to read the trigger's box from the DOM, before the browser paints.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    setPlacement(
      open && anchor
        ? {
            position: placeNear(anchor.getBoundingClientRect(), Math.min(width, window.innerWidth - 16), 320),
            // Stay inside an open <dialog>: anything outside the top layer would sit behind it.
            host: anchor.closest("dialog") ?? document.body,
          }
        : null,
    );
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        // Without preventDefault the browser also cancels the <dialog> this panel sits in.
        event.preventDefault();
        event.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !placement) return null;
  const { position, host } = placement;

  return createPortal(
    <div
      ref={panel}
      data-composer-layer
      role={role}
      aria-label={label}
      style={{
        position: "fixed",
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        right: position.right,
        width: `min(${width}px, calc(100vw - 16px))`,
        maxHeight: position.maxHeight,
        ["--origin" as string]: position.origin,
      }}
      className="pop-in z-50 flex flex-col overflow-hidden rounded-md border border-border bg-surface-raised shadow-float"
    >
      {children}
    </div>,
    host,
  );
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a separator above this item. */
  separated?: boolean;
}

interface MenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  items: readonly MenuItem[];
  label: string;
  width?: number;
}

export function Menu({ open, onClose, anchorRef, items, label, width = 208 }: MenuProps) {
  const list = useRef<HTMLDivElement>(null);

  const focusItem = useCallback((offset: number) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = current === -1 ? (offset > 0 ? 0 : buttons.length - 1) : (current + offset + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => focusItem(1));
  }, [open, focusItem]);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(-1);
    } else if (event.key === "Tab") {
      event.preventDefault();
      onClose();
      anchorRef.current?.focus();
    }
  };

  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} width={width} label={label} role="menu">
      <div ref={list} className="overflow-y-auto overscroll-contain p-1 max-md:p-2" onKeyDown={onKeyDown}>
        {items.map((item) => (
          <div key={item.id}>
            {item.separated ? <div className="mx-1 my-1 h-px bg-border" /> : null}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                // Before onSelect, so an action that opens something can still take focus.
                anchorRef.current?.focus();
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors duration-75 outline-none disabled:opacity-45 touch:py-3 max-md:text-base [@media(hover:hover)]:hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
                item.danger ? "text-danger" : "text-foreground"
              }`}
            >
              {item.icon ? <span className="shrink-0 [&_svg]:size-4">{item.icon}</span> : null}
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          </div>
        ))}
      </div>
    </Popover>
  );
}
