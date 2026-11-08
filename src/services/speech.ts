/**
 * Reads answers aloud with the device's own voices, through the Web Speech API. Nothing is
 * sent anywhere by NEXA; on some systems the browser itself may use an online voice.
 */

type Listener = () => void;

let speakingId: string | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function subscribeSpeech(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentlySpeaking(): string | null {
  return speakingId;
}

/** Markdown to something worth hearing: code is skipped, and symbols aren't read out. */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " Code block skipped. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~|]+/g, "")
    .replace(/\$\$?[^$]*\$\$?/g, " formula ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Long utterances stop early in some browsers, so the text is read in sentence-sized pieces. */
export function chunkText(text: string, size = 220): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > size && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  speakingId = null;
  emit();
}

export function speak(id: string, markdown: string): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  const chunks = chunkText(speakableText(markdown));
  if (chunks.length === 0) return;
  speakingId = id;
  emit();
  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = document.documentElement.lang === "fr" ? "fr-FR" : navigator.language;
    if (index === chunks.length - 1) {
      utterance.onend = () => {
        if (speakingId === id) {
          speakingId = null;
          emit();
        }
      };
    }
    utterance.onerror = () => {
      if (speakingId === id) {
        speakingId = null;
        emit();
      }
    };
    window.speechSynthesis.speak(utterance);
  });
}
