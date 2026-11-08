"use client";

/*
 * The Wensity sidebar from 21st.dev, kept as close to the original as the app allows: the
 * same variants (default, collapsible, icon rail, floating, resizable), the pill that glides
 * between active items, fading labels, animated nested groups and the scrollbar that only
 * shows while scrolling.
 *
 * What changed, and why:
 * - lucide icons instead of Tabler, because the app uses one icon set.
 * - The scrollbar styles live in globals.css: this site's CSP blocks injected <style> tags.
 * - --muted-foreground reads NEXA's --muted. --card reads --surface-raised.
 * - Rows grow to 44px under 768px, the minimum touch target.
 * - SidebarSection takes an `action`, and SidebarNested a `badge`, which NEXA needs.
 * - `width` may also be a CSS length, so a token works.
 */

import { useRender } from "@base-ui/react/use-render";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type SidebarVariant = "default" | "collapsible" | "icon-rail" | "floating" | "resizable";
export type SidebarSize = "compact" | "default" | "large";

/** Row text, row padding and icon size for each size. */
const SIZES: Record<SidebarSize, Record<string, string>> = {
  compact: { "--sb-text": "12.5px", "--sb-pad": "5px", "--sb-icon": "15px" },
  default: { "--sb-text": "13.5px", "--sb-pad": "7px", "--sb-icon": "17px" },
  large: { "--sb-text": "15px", "--sb-pad": "10px", "--sb-icon": "19px" },
};

export interface SidebarProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
  variant?: SidebarVariant;
  /** Controlled collapsed state (collapsible variant). */
  collapsed?: boolean;
  /** Initial collapsed state (uncontrolled). Default false. */
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Width when expanded: px, or any CSS length. Default 260. */
  width?: number | string;
  /** Width in px when collapsed. Default 60. */
  collapsedWidth?: number;
  /** Minimum width for the resizable variant. Default 180. */
  minWidth?: number;
  /** Maximum width for the resizable variant. Default 400. */
  maxWidth?: number;
  /** Adds the drag handle to any variant, collapsible included. Hidden while collapsed. */
  resizable?: boolean;
  /** Called with the new width when a drag or a key press ends, and undefined on reset. */
  onWidthChange?: (width: number | undefined) => void;
  /** Row size. Default "default". */
  size?: SidebarSize;
  "aria-label"?: string;
  children: React.ReactNode;
}

export interface SidebarSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Section heading. Fades out when the sidebar is collapsed. */
  label?: string;
  /** A small control at the end of the heading. */
  action?: React.ReactNode;
}

export interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shown in both expanded and collapsed states. */
  icon?: React.ReactNode;
  /** Marks the item as the current route. */
  active?: boolean;
  /** Renders as a link when provided. */
  href?: string;
  /** Opens in a new tab. */
  external?: boolean;
  /** Badge or count shown after the label. */
  badge?: React.ReactNode;
  asChild?: boolean;
}

export interface SidebarNestedProps {
  icon?: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Marks the group as containing the active item. */
  active?: boolean;
  children: React.ReactNode;
}

export interface SidebarToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children?: React.ReactNode | ((state: { collapsed: boolean }) => React.ReactNode);
  /** Standalone: the collapsed state, when used outside a collapsible <Sidebar>. */
  collapsed?: boolean;
  /** Standalone: called when toggled. */
  onToggle?: () => void;
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

interface SidebarContextValue {
  variant: SidebarVariant;
  collapsed: boolean;
  toggleCollapsed: () => void;
  navId: string;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebarContext(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("Sidebar compound components must be used within <Sidebar>");
  return context;
}

/** Reads the real collapsed state, so a logo or a profile row can react to it. */
export function useSidebar(): Pick<SidebarContextValue, "variant" | "collapsed" | "toggleCollapsed"> {
  const { variant, collapsed, toggleCollapsed } = useSidebarContext();
  return { variant, collapsed, toggleCollapsed };
}

/**
 * The width while dragging lives here. When the drag ends it's handed to `commit`, which either
 * stores it in the parent or keeps it locally.
 */
function useResizableWidth(navRef: React.RefObject<HTMLElement | null>, min: number, max: number, commit: (width: number | undefined) => void) {
  const [dragWidth, setDragWidth] = React.useState<number | null>(null);
  const isDragging = dragWidth !== null;
  const dragState = React.useRef<{ startX: number; startWidth: number; last: number } | null>(null);
  const clamp = React.useCallback((value: number) => Math.round(Math.min(max, Math.max(min, value))), [min, max]);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      const startWidth = navRef.current?.getBoundingClientRect().width ?? min;
      dragState.current = { startX: event.clientX, startWidth, last: startWidth };
      setDragWidth(startWidth);
    },
    [navRef, min],
  );

  React.useEffect(() => {
    if (!isDragging) return;
    const onPointerMove = (event: PointerEvent): void => {
      const state = dragState.current;
      if (!state) return;
      state.last = clamp(state.startWidth + event.clientX - state.startX);
      setDragWidth(state.last);
    };
    const onPointerUp = (): void => {
      if (dragState.current) commit(dragState.current.last);
      dragState.current = null;
      setDragWidth(null);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [isDragging, clamp, commit]);

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 48 : 16;
      const current = navRef.current?.getBoundingClientRect().width ?? min;
      const next: Record<string, number> = { ArrowLeft: current - step, ArrowRight: current + step, Home: min, End: max };
      const target = next[event.key];
      if (target === undefined) return;
      event.preventDefault();
      commit(clamp(target));
    },
    [navRef, clamp, commit, min, max],
  );

  const reset = React.useCallback(() => commit(undefined), [commit]);
  return { dragWidth, isDragging, onPointerDown, onKeyDown, reset };
}

const RING = "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

const itemBaseClasses = cn(
  "group/sidebar-item relative flex w-full items-center gap-2.5 rounded-[var(--primitive-radius-item,0.625rem)] px-3 py-[var(--sb-pad,7px)] touch:min-h-11",
  "text-[length:var(--sb-text,13.5px)] font-medium leading-none outline-none select-none whitespace-nowrap",
  "transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
  RING,
  "disabled:pointer-events-none disabled:opacity-40",
);

const itemInactiveClasses = cn(
  "text-[color:var(--primitive-text-secondary,color-mix(in_srgb,var(--foreground)_72%,transparent))]",
  "hover:text-[var(--foreground)]",
  "hover:bg-[color:var(--primitive-surface-hover,color-mix(in_srgb,var(--foreground)_4%,transparent))]",
);

const itemActiveClasses = "text-[var(--foreground)]";

const activePillClasses = cn(
  "pointer-events-none absolute inset-0 rounded-[var(--primitive-radius-item,0.625rem)]",
  "bg-[color:var(--primitive-surface-selected,color-mix(in_srgb,var(--foreground)_6%,transparent))]",
);

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  (
    {
      variant = "default",
      collapsed: controlledCollapsed,
      defaultCollapsed = false,
      onCollapsedChange,
      width: widthProp = 260,
      collapsedWidth = 60,
      minWidth = 180,
      maxWidth = 400,
      resizable = false,
      onWidthChange,
      size = "default",
      className,
      children,
      "aria-label": ariaLabel = "Sidebar",
      style,
      ...props
    },
    ref,
  ) => {
    const reactId = React.useId();
    const prefersReducedMotion = useReducedMotion();
    const isCollapsible = variant === "collapsible";
    const navRef = React.useRef<HTMLElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLElement | null) => {
        navRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const [internalCollapsed, setInternalCollapsed] = React.useState(defaultCollapsed);
    const isControlled = controlledCollapsed !== undefined;
    const collapsed = variant === "icon-rail" ? true : isCollapsible ? (isControlled ? controlledCollapsed : internalCollapsed) : false;

    const toggleCollapsed = React.useCallback(() => {
      if (!isCollapsible) return;
      const next = !collapsed;
      if (!isControlled) setInternalCollapsed(next);
      onCollapsedChange?.(next);
    }, [isCollapsible, collapsed, isControlled, onCollapsedChange]);

    // Without onWidthChange the sidebar remembers its own width, as the original resizable variant did.
    const [ownWidth, setOwnWidth] = React.useState<number | undefined>(undefined);
    const commitWidth = React.useCallback((next: number | undefined) => (onWidthChange ? onWidthChange(next) : setOwnWidth(next)), [onWidthChange]);
    const resize = useResizableWidth(navRef, minWidth, maxWidth, commitWidth);
    const canResize = (variant === "resizable" || resizable) && !collapsed;

    // The handle reports the real width, which may come from a CSS length rather than a number.
    const [measured, setMeasured] = React.useState(0);
    React.useEffect(() => {
      const nav = navRef.current;
      if (!canResize || !nav) return;
      const observer = new ResizeObserver(() => setMeasured(Math.round(nav.getBoundingClientRect().width)));
      observer.observe(nav);
      return () => observer.disconnect();
    }, [canResize]);
    const effectiveWidth = collapsed ? collapsedWidth : (resize.dragWidth ?? (onWidthChange ? widthProp : (ownWidth ?? widthProp)));

    const context = React.useMemo<SidebarContextValue>(() => ({ variant, collapsed, toggleCollapsed, navId: `sidebar-${reactId}` }), [variant, collapsed, toggleCollapsed, reactId]);

    return (
      <SidebarContext.Provider value={context}>
        <nav
          ref={setRefs}
          aria-label={ariaLabel}
          data-slot="sidebar"
          data-variant={variant}
          data-collapsed={collapsed ? "true" : "false"}
          data-dragging={resize.isDragging ? "true" : undefined}
          data-size={size}
          style={{
            ...SIZES[size],
            ...style,
            width: effectiveWidth,
            flexShrink: 0,
            // Width is a layout change by nature, so it animates through an interruptible CSS
            // transition rather than per-frame JS. Off while dragging.
            transition: resize.isDragging || prefersReducedMotion ? "none" : "width 240ms cubic-bezier(0.23,1,0.32,1)",
          }}
          className={cn(
            "relative isolate flex h-full flex-col overflow-hidden",
            "bg-[var(--background)] text-[var(--foreground)]",
            variant === "floating"
              ? cn(
                  "m-3 h-[calc(100%-1.5rem)] rounded-[var(--primitive-radius-surface,1rem)]",
                  "border border-[var(--border)]",
                  "bg-[color:var(--primitive-surface-elevated,var(--surface-raised))]",
                  "[box-shadow:var(--primitive-shadow-raised,0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.12))]",
                )
              : "border-r border-[var(--border)]",
            resize.isDragging && "select-none",
            className,
          )}
          {...props}
        >
          {children}
          {canResize ? (
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label={t("Resize sidebar")}
              aria-valuemin={minWidth}
              aria-valuemax={maxWidth}
              aria-valuenow={resize.dragWidth ?? measured}
              title={t("Drag to resize. Double-click to reset.")}
              data-slot="sidebar-resize-handle"
              onPointerDown={resize.onPointerDown}
              onKeyDown={resize.onKeyDown}
              onDoubleClick={resize.reset}
              className={cn(
                "absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize outline-none",
                "after:absolute after:inset-y-0 after:right-0 after:w-[2px]",
                "after:bg-transparent after:transition-colors after:duration-150",
                "hover:after:bg-[color-mix(in_srgb,var(--foreground)_18%,transparent)]",
                "focus-visible:after:bg-accent",
                resize.isDragging && "after:bg-[color-mix(in_srgb,var(--foreground)_30%,transparent)]",
              )}
            />
          ) : null}
        </nav>
      </SidebarContext.Provider>
    );
  },
);
Sidebar.displayName = "Sidebar";

function FadingLabel({ show, className, children }: { show: boolean; className?: string; children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: prefersReducedMotion ? 0 : 0.12, ease: EASE_OUT }} className={className}>
          {children}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, onClick, ...props }, ref) => {
  const { collapsed, variant, toggleCollapsed } = useSidebarContext();
  const isCollapsible = variant === "collapsible";

  // Collapsed, the toggle has no room at rail width, so the logo itself expands the sidebar.
  const visibleChildren = collapsed ? React.Children.toArray(children).filter((child) => !(React.isValidElement(child) && child.type === SidebarToggle)) : children;

  return (
    <div
      ref={ref}
      data-slot="sidebar-header"
      data-collapsed={collapsed ? "true" : "false"}
      role={collapsed && isCollapsible ? "button" : undefined}
      tabIndex={collapsed && isCollapsible ? 0 : undefined}
      aria-label={collapsed && isCollapsible ? t("Expand sidebar") : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (collapsed && isCollapsible) toggleCollapsed();
      }}
      onKeyDown={(event) => {
        if (collapsed && isCollapsible && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          toggleCollapsed();
        }
      }}
      className={cn(
        "flex shrink-0 items-center",
        collapsed
          ? cn(
              "flex-col justify-center gap-2 px-0 py-3",
              isCollapsible &&
                cn(
                  "cursor-pointer select-none outline-none rounded-[var(--primitive-radius-item,0.625rem)]",
                  "[transition:background-color_150ms_cubic-bezier(0.23,1,0.32,1),transform_120ms_cubic-bezier(0.23,1,0.32,1)]",
                  "hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)]",
                  RING,
                  "active:[transform:scale(0.97)] motion-reduce:active:[transform:none]",
                ),
            )
          : "h-[52px] gap-2.5 px-[18px]",
        className,
      )}
      {...props}
    >
      {visibleChildren}
    </div>
  );
});
SidebarHeader.displayName = "SidebarHeader";

const SCROLLBAR_LINGER_MS = 900;

/** The scrollbar stays hidden until the list moves, then fades out again. */
export const SidebarNav = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, onScroll, ...props }, ref) => {
  const { navId } = useSidebarContext();
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      ref={ref}
      id={navId}
      data-slot="sidebar-nav"
      onScroll={(event) => {
        onScroll?.(event);
        const element = event.currentTarget;
        element.classList.add("is-scrolling");
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => element.classList.remove("is-scrolling"), SCROLLBAR_LINGER_MS);
      }}
      className={cn("sidebar-nav min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain py-2 [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-16px),transparent)]", className)}
      {...props}
    >
      {children}
    </div>
  );
});
SidebarNav.displayName = "SidebarNav";

/** A section heading on its own, for lists that render their rows themselves. */
export function SidebarLabel({ label, action, className }: { label: string; action?: React.ReactNode; className?: string }) {
  const { collapsed } = useSidebarContext();
  return (
    <div className={cn("flex h-[26px] items-end justify-between gap-2 pr-2.5 pl-[18px] pb-1.5 touch:h-11 touch:items-center touch:pb-0", className)}>
      <FadingLabel show={!collapsed} className="text-[10.5px] leading-none font-medium tracking-[0.08em] whitespace-nowrap text-[var(--muted)] uppercase">
        {label}
      </FadingLabel>
      {action && !collapsed ? <span className="-mb-1 flex shrink-0 items-center touch:mb-0">{action}</span> : null}
    </div>
  );
}

export const SidebarSection = React.forwardRef<HTMLDivElement, SidebarSectionProps>(({ className, label, action, children, ...props }, ref) => {
  return (
    <div ref={ref} data-slot="sidebar-section" role="group" aria-label={label} className={cn("py-1", className)} {...props}>
      {label ? <SidebarLabel label={label} action={action} /> : null}
      <div className="flex flex-col gap-px px-2">{children}</div>
    </div>
  );
});
SidebarSection.displayName = "SidebarSection";

/** One pill per sidebar: it glides from the old active item to the new one. */
function ActivePill({ navId }: { navId: string }) {
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) return <span aria-hidden="true" className={activePillClasses} />;
  return <motion.span aria-hidden="true" layoutId={`${navId}-active-pill`} transition={{ type: "spring", stiffness: 520, damping: 42 }} className={activePillClasses} />;
}

export const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, icon, active = false, href, external = false, badge, asChild = false, children, disabled, ...props }, ref) => {
    const { collapsed, navId } = useSidebarContext();
    const composedClassName = cn(itemBaseClasses, active ? itemActiveClasses : itemInactiveClasses, className);
    const title = collapsed && typeof children === "string" ? children : undefined;
    const asChildElement = asChild && React.isValidElement(children) ? children : null;

    const asChildRendered = useRender({
      enabled: Boolean(asChildElement),
      ref: ref as React.Ref<HTMLElement>,
      render: asChildElement ?? undefined,
      props: {
        "data-slot": "sidebar-item",
        "data-active": active ? "true" : undefined,
        "aria-current": active ? "page" : undefined,
        title,
        className: composedClassName,
        ...props,
      },
    });
    if (asChildRendered) return asChildRendered;

    const content = (
      <>
        {active ? <ActivePill navId={navId} /> : null}
        {icon ? (
          <span
            data-slot="sidebar-item-icon"
            className={cn(
              "relative z-10 flex size-5 shrink-0 items-center justify-center [&_svg]:size-[var(--sb-icon,17px)]",
              active ? "text-[var(--foreground)]" : "text-[var(--muted)] transition-colors duration-150 group-hover/sidebar-item:text-[var(--foreground)]",
            )}
          >
            {icon}
          </span>
        ) : null}
        <FadingLabel show={!collapsed} className="relative z-10 min-w-0 flex-1 truncate text-left">
          {children}
        </FadingLabel>
        {badge ? (
          <FadingLabel show={!collapsed} className="relative z-10 flex shrink-0 items-center">
            {badge}
          </FadingLabel>
        ) : null}
      </>
    );

    if (href) {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          data-slot="sidebar-item"
          data-active={active ? "true" : undefined}
          aria-current={active ? "page" : undefined}
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          title={title}
          className={composedClassName}
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        data-slot="sidebar-item"
        data-active={active ? "true" : undefined}
        aria-current={active ? "page" : undefined}
        disabled={disabled}
        title={title}
        className={composedClassName}
        {...props}
      >
        {content}
      </button>
    );
  },
);
SidebarItem.displayName = "SidebarItem";

/** A count after a label, as in the original demo. */
export function SidebarBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] px-1.5 py-0.5 text-[10.5px] leading-none font-medium text-[var(--muted)] tabular-nums">{children}</span>;
}

export const SidebarNested = React.forwardRef<HTMLDivElement, SidebarNestedProps>(({ icon, label, badge, open: controlledOpen, defaultOpen = false, onOpenChange, active = false, children }, ref) => {
  const { collapsed } = useSidebarContext();
  const prefersReducedMotion = useReducedMotion();
  const reactId = React.useId();

  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = React.useCallback(() => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }, [open, isControlled, onOpenChange]);

  const contentId = `sidebar-nested-content-${reactId}`;

  return (
    <div ref={ref} data-slot="sidebar-nested" className="flex flex-col">
      <button
        type="button"
        data-slot="sidebar-nested-trigger"
        data-open={open ? "true" : "false"}
        data-active={active ? "true" : undefined}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={toggle}
        title={collapsed ? label : undefined}
        className={cn(itemBaseClasses, active && collapsed ? itemActiveClasses : itemInactiveClasses)}
      >
        {active && collapsed ? <span aria-hidden="true" className={activePillClasses} /> : null}
        {icon ? (
          <span
            data-slot="sidebar-nested-icon"
            className="relative z-10 flex size-5 shrink-0 items-center justify-center text-[var(--muted)] transition-colors duration-150 group-hover/sidebar-item:text-[var(--foreground)] [&_svg]:size-[var(--sb-icon,17px)]"
          >
            {icon}
          </span>
        ) : null}
        <FadingLabel show={!collapsed} className="relative z-10 min-w-0 flex-1 truncate text-left">
          {label}
        </FadingLabel>
        {badge !== undefined ? (
          <FadingLabel show={!collapsed} className="relative z-10 flex shrink-0 items-center">
            <SidebarBadge>{badge}</SidebarBadge>
          </FadingLabel>
        ) : null}
        <FadingLabel show={!collapsed} className="relative z-10 flex shrink-0 items-center">
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: EASE_OUT }}
            className="flex items-center justify-center text-[var(--muted)]"
          >
            <ChevronRight className="size-3.5" strokeWidth={2} />
          </motion.span>
        </FadingLabel>
      </button>
      <AnimatePresence initial={false}>
        {open && !collapsed ? (
          <motion.div
            id={contentId}
            data-slot="sidebar-nested-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: prefersReducedMotion ? 0 : 0.24, ease: EASE_OUT },
              opacity: { duration: prefersReducedMotion ? 0 : 0.16, ease: EASE_OUT },
            }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "relative ml-[21px] flex flex-col gap-px py-0.5 pl-2.5",
                "before:absolute before:inset-y-1 before:left-0 before:w-px",
                "before:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]",
              )}
            >
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
SidebarNested.displayName = "SidebarNested";

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => {
  const { collapsed } = useSidebarContext();
  return (
    <div
      ref={ref}
      data-slot="sidebar-footer"
      data-collapsed={collapsed ? "true" : "false"}
      className={cn("flex shrink-0 items-center border-t border-[var(--border)] py-3", collapsed ? "justify-center px-0" : "gap-2.5 px-[18px]", className)}
      {...props}
    >
      {children}
    </div>
  );
});
SidebarFooter.displayName = "SidebarFooter";

export const SidebarToggle = React.forwardRef<HTMLButtonElement, SidebarToggleProps>(({ className, children, collapsed: collapsedProp, onToggle, ...props }, ref) => {
  const context = React.useContext(SidebarContext);
  const usesContext = context?.variant === "collapsible";
  const collapsed = usesContext ? context.collapsed : collapsedProp;
  const toggle = usesContext ? context.toggleCollapsed : onToggle;
  if (collapsed === undefined || !toggle) return null;

  return (
    <button
      ref={ref}
      type="button"
      data-slot="sidebar-toggle"
      data-collapsed={collapsed ? "true" : "false"}
      onClick={toggle}
      aria-label={collapsed ? t("Expand sidebar") : t("Collapse sidebar")}
      aria-expanded={!collapsed}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-[var(--primitive-radius-control-sm,0.625rem)] outline-none touch:size-11",
        "text-[var(--muted)]",
        "hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-[var(--foreground)]",
        RING,
        "[transition:transform_120ms_cubic-bezier(0.23,1,0.32,1),color_150ms_ease,background-color_150ms_ease]",
        "active:[transform:scale(0.96)] motion-reduce:active:[transform:none]",
        className,
      )}
      {...props}
    >
      {typeof children === "function"
        ? children({ collapsed })
        : (children ?? (collapsed ? <PanelLeftOpen className="size-[17px]" strokeWidth={1.75} /> : <PanelLeftClose className="size-[17px]" strokeWidth={1.75} />))}
    </button>
  );
});
SidebarToggle.displayName = "SidebarToggle";
