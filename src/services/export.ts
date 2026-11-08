import type { Conversation, Message } from "@/types";

export type ExportFormat = "markdown" | "json" | "txt" | "html";

function visibleMessages(messages: readonly Message[]): Message[] {
  return messages.filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim());
}

function speaker(message: Message): string {
  return message.role === "user" ? "You" : (message.model?.modelName ?? "Assistant");
}

export function toMarkdown(conversation: Conversation, messages: readonly Message[]): string {
  const body = visibleMessages(messages).map((message) => `## ${speaker(message)}\n\n${message.content}`);
  return [`# ${conversation.title}`, ...body].join("\n\n") + "\n";
}

export function toPlainText(conversation: Conversation, messages: readonly Message[]): string {
  const body = visibleMessages(messages).map((message) => `${speaker(message)}:\n${message.content}`);
  return [conversation.title, ...body].join("\n\n") + "\n";
}

export function toJson(conversation: Conversation, messages: readonly Message[]): string {
  return JSON.stringify({ conversation, messages }, null, 2);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** A self-contained page with no script. Content is escaped, never rendered as HTML. */
export function toHtml(conversation: Conversation, messages: readonly Message[]): string {
  const body = visibleMessages(messages)
    .map((message) => `<section><h2>${escapeHtml(speaker(message))}</h2><pre>${escapeHtml(message.content)}</pre></section>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(conversation.title)}</title>
<style>
body { font: 16px/1.6 system-ui, sans-serif; color: #10222e; max-width: 46rem; margin: 3rem auto; padding: 0 1.5rem; }
h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 2rem; }
h2 { font-size: 0.875rem; margin: 2rem 0 0.5rem; color: #3f5563; }
pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
section { break-inside: avoid-page; }
</style>
</head>
<body>
<h1>${escapeHtml(conversation.title)}</h1>
${body}
</body>
</html>
`;
}

const FORMATS: Record<ExportFormat, { extension: string; mimeType: string; render: typeof toMarkdown }> = {
  markdown: { extension: "md", mimeType: "text/markdown", render: toMarkdown },
  json: { extension: "json", mimeType: "application/json", render: toJson },
  txt: { extension: "txt", mimeType: "text/plain", render: toPlainText },
  html: { extension: "html", mimeType: "text/html", render: toHtml },
};

export function fileNameFor(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "conversation"}.${extension}`;
}

export function downloadFile(content: BlobPart, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportConversation(conversation: Conversation, messages: readonly Message[], format: ExportFormat): void {
  const { extension, mimeType, render } = FORMATS[format];
  downloadFile(render(conversation, messages), fileNameFor(conversation.title, extension), mimeType);
}

/** Opens the browser's print dialog on a clean copy, where "Save as PDF" is one choice. */
export function printConversation(conversation: Conversation, messages: readonly Message[]): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
  frame.srcdoc = toHtml(conversation, messages);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.append(frame);
}
