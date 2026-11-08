"use client";

import { Check, Copy, Download, Play } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { SwapIcon } from "@/components/ui/swap-icon";
import { useCopy } from "@/hooks/use-copy";
import { downloadFile } from "@/services/export";
import { previewKind, usePreviewStore } from "../preview/preview-store";
import { useSettingsStore } from "../settings/settings-store";
import { fileExtension, languageLabel, loadHighlighter } from "./highlight";
import { t } from "@/i18n";

interface CodeBlockProps {
  code: string;
  language: string;
  /** While the block is still streaming, highlighting waits so it doesn't run per token. */
  streaming?: boolean;
}

export const CodeBlock = memo(function CodeBlock({ code, language, streaming = false }: CodeBlockProps) {
  const { copied, copy } = useCopy();
  const [highlighted, setHighlighted] = useState<{ source: string; html: string } | null>(null);
  const lineNumbers = useSettingsStore((state) => state.settings.showLineNumbers);
  const openPreview = usePreviewStore((state) => state.open);
  // Only once the block is complete: half an HTML page previews badly.
  const previewable = streaming ? undefined : previewKind(language, code);

  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    void loadHighlighter().then((hljs) => {
      if (cancelled) return;
      const known = language && hljs.getLanguage(language);
      // hljs escapes its input, so this output is safe to inject.
      const html = known ? hljs.highlight(code, { language, ignoreIllegals: true }).value : hljs.highlightAuto(code).value;
      setHighlighted({ source: code, html });
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, streaming]);

  const lines = useMemo(() => code.split("\n").length, [code]);
  const html = highlighted?.source === code ? highlighted.html : null;

  return (
    <figure className="my-0 overflow-hidden rounded-md border border-border bg-code">
      <figcaption className="flex h-9 items-center justify-between gap-2 border-b border-border pr-1 pl-3">
        <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent/70" />
          <span className="truncate">{t(languageLabel(language))}</span>
        </span>
        <span className="flex shrink-0 items-center">
          {previewable ? (
            <button
              type="button"
              onClick={() => openPreview(previewable, code)}
              className="press flex h-7 items-center gap-1.5 rounded-sm px-2 text-[0.8125rem] font-medium text-accent [@media(hover:hover)]:hover:bg-surface-hover touch:h-11"
            >
              <Play className="size-3.5" aria-hidden="true" />
              {t("Preview")}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t("Download as a file")}
            title={t("Download")}
            onClick={() => downloadFile(code, `snippet.${fileExtension(language)}`, "text/plain")}
            className="press flex size-7 items-center justify-center rounded-sm text-muted [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-foreground touch:size-11"
          >
            <Download className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void copy(code)}
            className="press flex h-7 items-center gap-1.5 rounded-sm px-2 text-[0.8125rem] text-muted [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-foreground touch:h-11"
          >
            <SwapIcon swapped={copied} from={<Copy className="size-3.5" />} to={<Check className="size-3.5 text-success" />} />
            <span aria-live="polite">{copied ? t("Copied") : t("Copy")}</span>
          </button>
        </span>
      </figcaption>
      <div className="flex overflow-x-auto overscroll-x-contain">
        {lineNumbers ? (
          <pre aria-hidden="true" className="tabular sticky left-0 shrink-0 bg-code py-3 pr-3 pl-3 text-right font-mono text-[0.8125rem] leading-[1.6] text-faint select-none">
            {Array.from({ length: lines }, (_, index) => index + 1).join("\n")}
          </pre>
        ) : null}
        <pre tabIndex={0} className="min-w-0 flex-1 px-3 py-3 font-mono text-[0.8125rem] leading-[1.6]">
          {html === null ? <code>{code}</code> : <code dangerouslySetInnerHTML={{ __html: html }} />}
        </pre>
      </div>
    </figure>
  );
});
