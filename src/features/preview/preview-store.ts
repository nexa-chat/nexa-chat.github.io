"use client";

import { create } from "zustand";

export type PreviewKind = "html" | "svg" | "mermaid";

interface PreviewState {
  /** id changes with every opening, so the frame reloads even for the same kind. */
  preview: { id: number; kind: PreviewKind; code: string } | null;
  open: (kind: PreviewKind, code: string) => void;
  close: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  preview: null,
  open: (kind, code) => set((state) => ({ preview: { id: (state.preview?.id ?? 0) + 1, kind, code } })),
  close: () => set({ preview: null }),
}));

/** Which code blocks can be previewed, from their fence language and, for XML, their content. */
export function previewKind(language: string, code: string): PreviewKind | undefined {
  const lang = language.toLowerCase();
  if (lang === "html" || lang === "htm") return "html";
  if (lang === "svg" || ((lang === "xml" || lang === "") && /^\s*<svg[\s>]/i.test(code))) return "svg";
  if (lang === "mermaid") return "mermaid";
  return undefined;
}
