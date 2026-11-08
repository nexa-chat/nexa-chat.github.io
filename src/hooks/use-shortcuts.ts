"use client";

import { useEffect } from "react";
import { stopGeneration, isGenerating } from "@/features/chat/chat-actions";
import { useChatStore } from "@/features/chat/chat-store";
import { useUiStore } from "@/features/shell/ui-store";

export const COMPOSER_INPUT_ID = "nexa-composer-input";

function focusComposer(): void {
  document.getElementById(COMPOSER_INPUT_ID)?.focus();
}

/** Global keyboard shortcuts. Ctrl and Cmd are treated the same. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const ui = useUiStore.getState();
      const chat = useChatStore.getState();

      if (command && key === "k") {
        event.preventDefault();
        if (ui.paletteOpen) ui.closePalette();
        else ui.openPalette("search");
      } else if (command && event.shiftKey && key === "p") {
        event.preventDefault();
        ui.openPalette("actions");
      } else if ((command && key === "n") || (event.altKey && key === "n")) {
        // Browsers keep Ctrl+N in a normal tab, so Alt+N does the same job there.
        event.preventDefault();
        chat.newChat();
        requestAnimationFrame(focusComposer);
      } else if (command && key === "/") {
        event.preventDefault();
        focusComposer();
      } else if (key === "escape" && isGenerating(chat.activeId) && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        stopGeneration(chat.activeId);
      } else if (event.key.length === 1 && !command && !event.altKey && document.activeElement === document.body && !document.querySelector("dialog[open]")) {
        // Typing anywhere starts a message, so the closed composer never costs a click.
        focusComposer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
