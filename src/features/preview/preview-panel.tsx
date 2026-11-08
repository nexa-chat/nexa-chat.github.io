"use client";

import { LoaderCircle, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { usePreviewStore, type PreviewKind } from "./preview-store";
import { t } from "@/i18n";
import { withBase } from "@/lib/base-path";

const FRAME_URL = withBase("/preview-frame.html");

function svgPage(svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:#fff}svg{max-width:100%;height:auto}</style></head><body>${svg}</body></html>`;
}

let mermaidCount = 0;

/** Mermaid renders here, in the app, with its strict mode: the frame only ever receives SVG. */
async function renderMermaid(code: string): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
  mermaidCount += 1;
  const { svg } = await mermaid.render(`nexa-mermaid-${mermaidCount}`, code);
  return svg;
}

async function pageFor(kind: PreviewKind, code: string): Promise<string> {
  if (kind === "mermaid") return svgPage(await renderMermaid(code));
  if (kind === "svg") return svgPage(code);
  return code;
}

const LABELS: Record<PreviewKind, string> = { html: "HTML", svg: "SVG", mermaid: "Diagram" };

function PreviewFrame({ kind, code, run }: { kind: PreviewKind; code: string; run: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<{ phase: "loading" } | { phase: "ready" } | { phase: "error"; message: string }>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    const page = pageFor(kind, code);
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.current?.contentWindow || (event.data as { type?: string } | null)?.type !== "nexa-preview-ready") return;
      void page.then(
        (html) => {
          if (cancelled) return;
          // The frame has an opaque origin, so "*" is the only target it can receive on.
          frame.current?.contentWindow?.postMessage({ type: "nexa-preview", html }, "*");
          setState({ phase: "ready" });
        },
        (caught: unknown) => {
          if (!cancelled) setState({ phase: "error", message: caught instanceof Error ? caught.message : t("This diagram couldn't be drawn.") });
        },
      );
    };
    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, [kind, code, run]);

  return (
    <div className="relative min-h-0 flex-1 bg-white">
      <iframe key={run} ref={frame} title={`${LABELS[kind]} preview`} src={FRAME_URL} sandbox="allow-scripts allow-modals" className="size-full border-0" />
      {state.phase === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface text-muted">
          <LoaderCircle className="size-5 animate-spin" aria-label={t("Loading the preview")} />
        </div>
      ) : null}
      {state.phase === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface p-6 text-center text-sm text-muted">
          <p>
            {state.message}
            <br />
            {t("Check the diagram's syntax, or ask the model to fix it.")}</p>
        </div>
      ) : null}
    </div>
  );
}

function Toolbar({ kind, onReload, onClose }: { kind: PreviewKind; onReload: () => void; onClose: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border pr-2 pl-4">
      <p className="min-w-0 flex-1 truncate text-sm font-medium">
        {t("Preview")}{" "}<span className="text-muted">· {LABELS[kind]}</span>
      </p>
      <IconButton label={t("Run again")} onClick={onReload}>
        <RotateCw className="size-4" />
      </IconButton>
      <IconButton label={t("Close the preview")} onClick={onClose}>
        <X className="size-4" />
      </IconButton>
    </div>
  );
}

/**
 * Shows generated HTML, SVG or a Mermaid diagram beside the chat on a wide screen, or in a
 * sheet on a phone. It runs isolated: see the preview-frame route for what it may and may not do.
 */
export function PreviewPanel() {
  const preview = usePreviewStore((state) => state.preview);
  const close = usePreviewStore((state) => state.close);
  const [run, setRun] = useState(0);
  const narrow = useIsMobile();
  const compact = useMediaQueryLarge() === false;

  if (!preview) return null;
  const body = (
    <>
      <Toolbar kind={preview.kind} onReload={() => setRun((value) => value + 1)} onClose={close} />
      <PreviewFrame key={preview.id} kind={preview.kind} code={preview.code} run={run} />
      <p className="shrink-0 border-t border-border px-4 py-2 text-xs text-faint">{t("Runs isolated: it can't see your keys or chats, and can't send data anywhere.")}</p>
    </>
  );

  if (narrow || compact) {
    return (
      <Dialog open onClose={close} title={t("Preview · {0}", { 0: LABELS[preview.kind] })} size="xl">
        <div className={cn("-mx-5 -mb-5 flex h-[70dvh] flex-col")}>{body}</div>
      </Dialog>
    );
  }

  return (
    <aside aria-label={t("Preview")} className="flex h-full w-[min(46%,44rem)] min-w-[22rem] shrink-0 flex-col border-l border-border bg-surface">
      {body}
    </aside>
  );
}

/** The side panel needs room beside the chat. Below 1024px it opens as a dialog instead. */
function useMediaQueryLarge(): boolean | undefined {
  const [large, setLarge] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 64rem)");
    const apply = (): void => setLarge(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return large;
}
