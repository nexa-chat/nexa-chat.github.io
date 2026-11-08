"use client";

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { LogoMark } from "@/components/brand/logo";
import { toast } from "@/components/ui/toast";
import { downloadFile } from "@/services/export";
import type { Message } from "@/types";
import { Markdown } from "../markdown/markdown";
import { ModelAvatar } from "./model-avatar";
import { t } from "@/i18n";

const CARD_WIDTH = 760;

/** The answer as a card: the question above it, and the route underneath, NEXA's signature. */
function AnswerCard({ answer, question }: { answer: Message; question?: Message }) {
  return (
    <div data-capture style={{ width: CARD_WIDTH }} className="bg-background p-10 text-foreground">
      <div className="rounded-2xl border border-border bg-surface p-8">
        {question?.content ? (
          <p className="mb-6 ml-auto w-fit max-w-[85%] rounded-xl bg-background-deep px-4 py-2.5 text-[0.9375rem] whitespace-pre-wrap text-muted">{question.content.length > 400 ? `${question.content.slice(0, 400)}…` : question.content}</p>
        ) : null}
        {answer.model ? (
          <p className="mb-3 flex items-center gap-2 text-[0.8125rem] font-medium text-muted">
            <ModelAvatar model={answer.model} />
            {answer.model.modelName}
          </p>
        ) : null}
        <div className="text-[0.9375rem]">
          <Markdown content={answer.content} />
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3 px-2 text-[0.8125rem] text-muted">
        <span className="size-1.5 rounded-full bg-accent" />
        <span className="h-px flex-1 bg-accent/40" />
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <LogoMark size={14} className="text-accent" />
          {t("NEXA")}</span>
      </div>
    </div>
  );
}

/**
 * Renders the card off screen, turns it into a PNG in the browser, then shares it where the
 * device can, or downloads it. Nothing is uploaded.
 */
export async function shareAnswerAsImage(answer: Message, question?: Message): Promise<void> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${CARD_WIDTH}px;pointer-events:none`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<AnswerCard answer={answer} question={question} />));
    // Highlighting and maths load lazily; give them a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await document.fonts.ready;
    const { domToBlob } = await import("modern-screenshot");
    const node = host.firstElementChild as HTMLElement | null;
    if (!node) throw new Error("Nothing to capture");
    const blob = await domToBlob(node, { scale: 2, type: "image/png" });
    const file = new File([blob], "nexa-answer.png", { type: "image/png" });

    // Phones share through their sheet. A computer just saves the file.
    if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
      }
    }
    downloadFile(blob, "nexa-answer.png", "image/png");
    toast.success(t("Image saved."));
  } catch {
    toast.error(t("The image couldn't be made. Try again, or copy the text instead."));
  } finally {
    root.unmount();
    host.remove();
  }
}
