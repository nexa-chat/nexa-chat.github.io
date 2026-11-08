import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "s" | "m" | "l";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
}

/*
 * Buttons share the sidebar's vocabulary: 10px corners, 13.5px medium text, and surfaces mixed
 * from the foreground instead of hard outlines. Only the primary action carries colour.
 */
const BASE =
  "press inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium select-none " +
  "[transition:transform_140ms_var(--ease-out),background-color_150ms_ease,color_150ms_ease,border-color_150ms_ease] " +
  "disabled:cursor-not-allowed [&_svg]:shrink-0";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.16)] hover:bg-primary-hover " +
    // Disabled, the primary loses its colour, so it can't pass for an available action.
    "disabled:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] disabled:text-faint disabled:shadow-none",
  secondary:
    "border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] text-foreground " +
    "hover:border-[color-mix(in_srgb,var(--foreground)_16%,transparent)] hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] disabled:opacity-40",
  ghost: "text-muted hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground disabled:opacity-40",
  // Destructive actions stay quiet until someone commits to them.
  danger: "border border-danger/35 text-danger hover:border-danger/60 hover:bg-danger-soft focus-visible:bg-danger-soft disabled:opacity-40",
};

const SIZES: Record<Size, string> = {
  s: "h-8 gap-1.5 rounded-[0.625rem] px-3 text-[0.8125rem] touch:h-11 [&_svg]:size-3.5",
  m: "h-9 gap-2 rounded-[0.625rem] px-3.5 text-[0.84375rem] touch:h-11 [&_svg]:size-4",
  l: "h-11 gap-2 rounded-xl px-5 text-[0.9375rem] [&_svg]:size-4",
};

export function Button({ variant = "secondary", size = "m", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  size?: "s" | "m";
  active?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({ label, size = "m", active = false, className, type = "button", children, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "press inline-flex shrink-0 items-center justify-center rounded-[0.625rem] select-none disabled:cursor-not-allowed disabled:opacity-40",
        "[transition:transform_140ms_var(--ease-out),background-color_150ms_ease,color_150ms_ease]",
        "hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground",
        active ? "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent" : "text-muted",
        size === "s" ? "size-7 touch:size-11" : "size-9 touch:size-11",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
