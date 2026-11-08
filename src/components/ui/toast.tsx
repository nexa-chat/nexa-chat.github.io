"use client";

import { Toaster as Sonner, toast as sonner } from "sonner";
import { Notice, type NoticeVariant } from "./notifications-5";
import { t } from "@/i18n";

/** A two-sentence message reads better as a title and a line of detail. */
function splitMessage(message: string): { title: string; body?: string } {
  const end = message.indexOf(". ");
  if (end === -1) return { title: message.replace(/\.$/, "") };
  return { title: message.slice(0, end), body: message.slice(end + 2) };
}

function show(variant: NoticeVariant, message: string, duration: number): void {
  const { title, body } = splitMessage(t(message));
  sonner.custom((id) => <Notice variant={variant} title={title} body={body} onDismiss={() => sonner.dismiss(id)} />, { duration });
}

/** Callable from anywhere, no hook needed. */
export const toast = {
  success: (message: string) => show("success", message, 3500),
  info: (message: string) => show("info", message, 3500),
  warning: (message: string) => show("warning", message, 5000),
  error: (message: string) => show("error", message, 7000),
};

/** Sonner handles swipe to dismiss, stacking, and pausing timers while the tab is hidden. */
export function Toaster() {
  return <Sonner position="top-center" visibleToasts={3} gap={8} offset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }} mobileOffset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }} containerAriaLabel="Notifications" />;
}
