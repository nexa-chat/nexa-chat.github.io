"use client";

import { create } from "zustand";
import type { ToolCall } from "@/types";

export type ApprovalAnswer = "once" | "always" | "deny";

interface PendingApproval {
  call: ToolCall;
  source: string;
  resolve: (answer: ApprovalAnswer) => void;
}

interface ApprovalState {
  /** Tool calls waiting for the user, keyed by call id. */
  pending: Record<string, PendingApproval>;
}

export const useApprovalStore = create<ApprovalState>(() => ({ pending: {} }));

function settle(callId: string, answer: ApprovalAnswer): void {
  const entry = useApprovalStore.getState().pending[callId];
  if (!entry) return;
  useApprovalStore.setState((state) => {
    const pending = { ...state.pending };
    delete pending[callId];
    return { pending };
  });
  entry.resolve(answer);
}

/** Waits for the user to allow or deny a call. Stopping the answer counts as a refusal. */
export function requestApproval(call: ToolCall, source: string, signal: AbortSignal): Promise<ApprovalAnswer> {
  if (signal.aborted) return Promise.resolve("deny");
  return new Promise((resolve) => {
    useApprovalStore.setState((state) => ({ pending: { ...state.pending, [call.id]: { call, source, resolve } } }));
    signal.addEventListener("abort", () => settle(call.id, "deny"), { once: true });
  });
}

export function answerApproval(callId: string, answer: ApprovalAnswer): void {
  settle(callId, answer);
}
