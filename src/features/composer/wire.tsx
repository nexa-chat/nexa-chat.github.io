"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { hostOf } from "@/lib/url";
import type { ProviderConfig } from "@/types";
import { useChatStore } from "../chat/chat-store";
import { t } from "@/i18n";

/** Errors that mean the route itself failed, as opposed to a request the model refused. */
const ROUTE_ERRORS = new Set([
  "invalid_api_key",
  "access_denied",
  "not_found",
  "model_not_found",
  "invalid_endpoint",
  "timeout",
  "quota_exceeded",
  "provider_error",
  "bad_gateway",
  "unavailable",
  "cors",
  "mixed_content",
  "network",
  "offline",
  "malformed_response",
  "stream_interrupted",
  "config",
  "relay_unavailable",
]);

type WireState = { kind: "idle" } | { kind: "live" } | { kind: "retrying" } | { kind: "limited" } | { kind: "fallback"; from: string } | { kind: "broken"; reason: string };

function useWireState(provider: ProviderConfig): WireState {
  const phase = useChatStore((state) => (state.activeId ? state.streams[state.activeId]?.phase : undefined));
  const lastError = useChatStore((state) => {
    const last = state.messages.at(-1);
    return last?.role === "assistant" && last.status === "error" ? last.error : undefined;
  });
  const fellBackFrom = useChatStore((state) => {
    const last = state.messages.at(-1);
    return last?.role === "assistant" && last.status !== "error" ? last.fellBackFrom?.modelName : undefined;
  });

  if (phase === "retrying") return { kind: "retrying" };
  if (phase) return { kind: "live" };
  if (fellBackFrom) return { kind: "fallback", from: fellBackFrom };
  if (lastError?.code === "rate_limited") return { kind: "limited" };
  if (lastError && ROUTE_ERRORS.has(lastError.code)) return { kind: "broken", reason: lastError.title };
  if (provider.health === "error") return { kind: "broken", reason: provider.healthDetail ?? t("The last test failed") };
  if (provider.health === "rate_limited") return { kind: "limited" };
  return { kind: "idle" };
}

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Two moments of motion, both rare. The first time a provider connects, the line draws itself
 * from the composer to the host. When an answer ends, the line glows once and settles.
 */
function useWireMotion(provider: ProviderConfig, live: boolean) {
  const line = useRef<HTMLSpanElement>(null);
  const terminal = useRef<HTMLSpanElement>(null);
  const wasLive = useRef(live);

  useEffect(() => {
    if (provider.health !== "connected" || !line.current) return;
    const key = `nexa-wire-drawn:${provider.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    if (reducedMotion()) return;
    line.current.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 640, easing: EASE_OUT, delay: 120, fill: "backwards" });
    terminal.current?.animate([{ transform: "scale(0.4)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 260, easing: EASE_OUT });
  }, [provider.id, provider.health]);

  useEffect(() => {
    const ended = wasLive.current && !live;
    wasLive.current = live;
    if (!ended || !line.current || reducedMotion()) return;
    line.current.animate([{ opacity: 1, filter: "brightness(1.6)" }, { opacity: 1, filter: "brightness(1)" }], { duration: 700, easing: EASE_OUT });
  }, [live]);

  return { line, terminal };
}

const TONE = {
  idle: { dot: "bg-accent", line: "bg-accent/40", pulse: "bg-accent" },
  live: { dot: "bg-accent", line: "bg-accent/40", pulse: "bg-accent" },
  retrying: { dot: "bg-warning", line: "bg-warning/40", pulse: "bg-warning" },
  limited: { dot: "bg-warning", line: "bg-warning/40", pulse: "bg-warning" },
  fallback: { dot: "bg-warning", line: "bg-warning/40", pulse: "bg-warning" },
  broken: { dot: "bg-danger", line: "", pulse: "" },
} as const;

interface WireProps {
  provider: ProviderConfig;
  /** The stem only joins the composer while the composer is open at full width. */
  attached: boolean;
}

/**
 * The product's signature: the literal route a message takes. It leaves the composer, runs in a
 * straight line and ends at the provider's host. It also tells the truth about that route:
 * amber while a request is retried or rate limited, red and broken when the route failed.
 */
export function Wire({ provider, attached }: WireProps) {
  const state = useWireState(provider);
  const live = state.kind === "live" || state.kind === "retrying";
  const { line, terminal } = useWireMotion(provider, live);
  const relay = provider.connection === "relay";
  const host = hostOf(provider.baseUrl);
  const tone = TONE[state.kind];
  const broken = state.kind === "broken";

  const status =
    state.kind === "broken"
      ? t("Connection to {0} failed: {1}", { 0: host, 1: t(state.reason) })
      : state.kind === "retrying"
        ? t("Retrying {0}", { 0: host })
        : state.kind === "limited"
          ? t("{0} is rate limiting requests", { 0: host })
          : state.kind === "fallback"
            ? t("{0} failed, so the fallback model answered", { 0: state.from })
          : relay
            ? t("Sent through the relay to {0}", { 0: host })
            : t("Sent directly to {0}", { 0: host });

  return (
    <Link
      href={broken || state.kind === "limited" ? "/settings/providers" : "/settings/privacy"}
      title={broken ? t("{0}. Open your providers to check it.", { 0: t(state.reason) }) : relay ? t("Requests pass through this site's relay on their way to {0}", { 0: host }) : t("Requests go straight from your browser to {0}", { 0: host })}
      className="group relative mx-auto flex min-h-9 w-full max-w-[var(--reading-width)] items-center gap-2 px-6 touch:min-h-11 sm:px-8"
    >
      <span className="sr-only" role="status">
        {status}
      </span>
      {/* The stem that joins the line to the composer above it. */}
      {attached ? <span aria-hidden="true" className={`absolute top-0 bottom-1/2 left-[calc(1.5rem+2.5px)] w-px opacity-60 sm:left-[calc(2rem+2.5px)] ${tone.dot}`} /> : null}
      <span ref={terminal} aria-hidden="true" className={`size-1.5 shrink-0 rounded-full transition-colors duration-300 ${tone.dot}`} />
      {broken ? (
        // A broken route is drawn broken: two dashed ends that don't meet.
        <span aria-hidden="true" className="flex min-w-6 flex-1 items-center gap-2">
          <span className="h-0 flex-1 border-t border-dashed border-danger/60" />
          <span className="text-xs leading-none text-danger">×</span>
          <span className="h-0 flex-1 border-t border-dashed border-danger/60" />
        </span>
      ) : (
        <span ref={line} aria-hidden="true" className={`relative h-px min-w-6 flex-1 origin-left overflow-hidden transition-colors duration-300 ${tone.line}`}>
          {live ? <span className={`absolute inset-y-0 left-0 w-1/4 ${tone.pulse}`} style={{ animation: "wire-pulse 1.1s linear infinite" }} /> : null}
        </span>
      )}
      {relay && !broken ? (
        <>
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full border border-warning" />
          <span aria-hidden="true" className="shrink-0 text-xs text-warning">
            relay
          </span>
          <span aria-hidden="true" className="h-px w-6 shrink-0 bg-accent/40" />
        </>
      ) : null}
      <span aria-hidden="true" className={`max-w-[65%] shrink-0 truncate text-[0.8125rem] transition-colors duration-100 group-hover:text-foreground ${broken ? "text-danger" : "text-muted"}`}>
        {broken ? <span className="max-sm:hidden">{t("failed:")}{" "}</span> : state.kind === "retrying" ? <span className="max-sm:hidden">{t("retrying")}{" "}</span> : state.kind === "limited" ? <span className="max-sm:hidden">{t("rate limited by")}{" "}</span> : state.kind === "fallback" ? <span className="max-sm:hidden">{t("answered through the fallback,")}{" "}</span> : relay ? null : <span className="max-sm:hidden">{t("direct to")}{" "}</span>}
        <span className={`font-mono text-xs ${broken ? "text-danger" : "text-foreground"}`}>{host}</span>
      </span>
    </Link>
  );
}
