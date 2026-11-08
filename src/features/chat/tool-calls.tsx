"use client";

import { Check, ChevronRight, LoaderCircle, ShieldQuestion, Wrench, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseArguments } from "@/services/tools/registry";
import type { Message, ToolCall, ToolResult } from "@/types";
import { useChatStore } from "./chat-store";
import { answerApproval, useApprovalStore } from "./tool-approvals";
import { t } from "@/i18n";

function displayName(name: string): string {
  const [source, ...rest] = name.split("__");
  return rest.length > 0 ? `${rest.join("__")} · ${source === "nexa" ? "NEXA" : source}` : name;
}

function argumentsText(call: ToolCall): string {
  const args = parseArguments(call);
  if (!args) return call.arguments;
  return JSON.stringify(args, null, 2);
}

function Approval({ call }: { call: ToolCall }) {
  const pending = useApprovalStore((state) => state.pending[call.id]);
  if (!pending) return null;
  return (
    <div role="group" aria-label={t("Allow {0}?", { 0: displayName(call.name) })} className="mt-2 rounded-lg border border-accent/50 bg-accent-soft px-3 py-2.5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldQuestion className="size-4 shrink-0 text-accent" aria-hidden="true" />
        {t("Run this tool on")}{" "}{pending.source}?
      </p>
      <p className="mt-1 text-[0.8125rem] text-muted">{t("The model wants to send this to the server. Nothing runs until you choose.")}</p>
      <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-code px-2 py-1.5 font-mono text-xs whitespace-pre-wrap">{argumentsText(call)}</pre>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="s" variant="primary" onClick={() => answerApproval(call.id, "once")}>
          {t("Allow once")}</Button>
        <Button size="s" onClick={() => answerApproval(call.id, "always")}>
          {t("Always allow this tool")}</Button>
        <Button size="s" variant="danger" onClick={() => answerApproval(call.id, "deny")}>
          {t("Deny")}</Button>
      </div>
    </div>
  );
}

function CallRow({ call, result }: { call: ToolCall; result?: ToolResult }) {
  const waiting = useApprovalStore((state) => Boolean(state.pending[call.id]));
  const [open, setOpen] = useState(false);
  const status = result ? (result.isError ? "failed" : "done") : waiting ? "waiting" : "running";

  return (
    <li className="rounded-lg border border-border bg-surface">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8125rem] touch:min-h-11">
        <ChevronRight className={cn("size-3.5 shrink-0 text-faint transition-transform duration-150", open && "rotate-90")} aria-hidden="true" />
        <Wrench className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{displayName(call.name)}</span>
        {status === "done" ? <Check className="size-3.5 shrink-0 text-success" aria-label={t("Done")} /> : null}
        {status === "failed" ? <X className="size-3.5 shrink-0 text-danger" aria-label={t("Failed or declined")} /> : null}
        {status === "running" ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted" aria-label={t("Running")} /> : null}
        {status === "waiting" ? <span className="shrink-0 text-xs font-medium text-accent">{t("Needs your OK")}</span> : null}
      </button>
      {open ? (
        <div className="border-t border-border px-3 py-2 text-xs">
          <p className="text-faint">{t("Arguments")}</p>
          <pre className="mt-1 overflow-x-auto rounded-md bg-code px-2 py-1.5 font-mono whitespace-pre-wrap">{argumentsText(call)}</pre>
          {result ? (
            <>
              <p className={cn("mt-2", result.isError ? "text-danger" : "text-faint")}>{result.isError ? t("Error") : t("Result")}</p>
              <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-code px-2 py-1.5 font-mono whitespace-pre-wrap">{result.content}</pre>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="px-3 pb-2 empty:hidden">
        <Approval call={call} />
      </div>
    </li>
  );
}

/** The tools an answer called, with their arguments, results and any approval still to give. */
export function ToolCalls({ message }: { message: Message }) {
  const results = useChatStore((state) => state.messages.find((item) => item.role === "tool" && item.parentId === message.id)?.toolResults);
  if (!message.toolCalls?.length) return null;
  return (
    <ul aria-label={t("Tools used")} className="mt-2 flex flex-col gap-1.5">
      {message.toolCalls.map((call) => (
        <CallRow key={call.id} call={call} result={results?.find((item) => item.toolCallId === call.id)} />
      ))}
    </ul>
  );
}
