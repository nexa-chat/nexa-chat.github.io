import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type NoticeVariant = "success" | "info" | "warning" | "error";

const CONFIG: Record<NoticeVariant, { icon: LucideIcon; accent: string }> = {
  success: { icon: CircleCheck, accent: "text-success" },
  info: { icon: Info, accent: "text-accent" },
  warning: { icon: TriangleAlert, accent: "text-warning" },
  error: { icon: CircleAlert, accent: "text-danger" },
};

interface NoticeProps {
  variant: NoticeVariant;
  title: string;
  body?: string;
  onDismiss?: () => void;
  /** Actions, placed under the text. */
  children?: ReactNode;
  className?: string;
}

/** Adapted from 21st.dev's notifications-5: one card for toasts and inline errors alike. */
export function Notice({ variant, title, body, onDismiss, children, className }: NoticeProps) {
  const { icon: Icon, accent } = CONFIG[variant];

  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex w-full items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-float", className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", accent)} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold [overflow-wrap:anywhere]">{title}</span>
        {body ? <span className="text-[0.8125rem] leading-snug text-muted [overflow-wrap:anywhere]">{body}</span> : null}
        {children}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("Dismiss")}
          className="press -mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-100 max-md:-mt-2.5 max-md:-mr-2.5 touch:size-11 [@media(hover:hover)]:hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
