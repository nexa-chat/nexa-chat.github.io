import type { ChatRequest, ProviderAdapter } from "@/providers";

const MAX_TITLE_LENGTH = 48;
const TITLE_SYSTEM =
  "Write a short title for this conversation, 2 to 5 words, in the language of the user's message. " +
  "Name the topic. Output only the title, with no quotes and no final punctuation.";

/** Immediate local title, shown until (or instead of) a generated one. */
export function heuristicTitle(text: string): string {
  const firstLine = text.trim().split(/\n/)[0] ?? "";
  const sentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  const clean = sentence.replace(/[`*_#>]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  if (clean.length <= MAX_TITLE_LENGTH) return clean;
  const cut = clean.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 20 ? lastSpace : MAX_TITLE_LENGTH).trimEnd()}…`;
}

export function cleanTitle(raw: string): string | undefined {
  const title = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .split("\n")[0]
    ?.replace(/^(title\s*:\s*)/i, "")
    .replace(/^["'“”«»*_#\s]+|["'“”«»*_.!\s]+$/g, "")
    .trim();
  if (!title) return undefined;
  return title.length > MAX_TITLE_LENGTH ? heuristicTitle(title) : title;
}

export async function generateTitle(
  adapter: Pick<ProviderAdapter, "sendMessage">,
  model: ChatRequest["model"],
  userText: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const result = await adapter.sendMessage({
    model,
    system: TITLE_SYSTEM,
    messages: [{ role: "user", parts: [{ type: "text", text: userText.slice(0, 1500) }] }],
    params: { maxTokens: 64 },
    signal,
    timeoutMs: 20_000,
  });
  return cleanTitle(result.text);
}
