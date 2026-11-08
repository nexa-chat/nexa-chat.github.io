"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { t } from "@/i18n";

/** Copies text and reports `copied` for a moment, so the button can say so. */
export function useCopy(duration = 1500): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), duration);
      } catch {
        toast.error(t("The browser blocked copying."));
      }
    },
    [duration],
  );

  return { copied, copy };
}
