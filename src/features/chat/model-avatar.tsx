import type { MessageModelRef } from "@/types";

/** Hues that stay clear of blue, so every avatar sits with the warm palettes. */
const HUES = [75, 160, 300, 30, 115] as const;

function hueFor(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return HUES[hash % HUES.length] ?? HUES[0];
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;

function firstGrapheme(word: string): string {
  if (!segmenter) return word.charAt(0);
  for (const { segment } of segmenter.segment(word)) return segment;
  return "";
}

/** "Mock GPT" gives MG, "claude-opus-4" gives CO, one word gives its first two letters. */
export function initialsOf(name: string): string {
  const words = name.split(/[\s\-_/.]+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const [first = ""] = words;
    return (firstGrapheme(first) + firstGrapheme(first.slice(firstGrapheme(first).length))).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => firstGrapheme(word))
    .join("")
    .toUpperCase();
}

/** A small mark per model, so answers from different models are told apart at a glance. */
export function ModelAvatar({ model, size = 20 }: { model: MessageModelRef; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="model-avatar inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ["--h" as string]: hueFor(model.modelConfigId || model.modelName) }}
    >
      {initialsOf(model.modelName)}
    </span>
  );
}
