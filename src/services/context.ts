import type { ChatMessage, ChatPart, ProviderAdapter } from "@/providers";
import { getStorage } from "@/storage";
import type { Attachment, Conversation, Folder, Message, ModelCapabilities } from "@/types";
import { blobToBase64 } from "./files";

export const CONTINUE_INSTRUCTION =
  "Continue exactly where your previous response stopped. Do not repeat anything or add an introduction.";

function fileAsText(attachment: Attachment): string {
  return `<file name="${attachment.name.replaceAll('"', "'")}">\n${attachment.extractedText ?? ""}\n</file>`;
}

async function attachmentPart(
  attachment: Attachment,
  capabilities: ModelCapabilities,
  adapter: Pick<ProviderAdapter, "supportsFeature">,
): Promise<ChatPart> {
  if (attachment.kind === "image") {
    // The composer refuses this case. History can still hold images from another model.
    if (!capabilities.supportsVision) return { type: "text", text: `[Image not sent to this model: ${attachment.name}]` };
    const record = await getStorage().get("blobs", attachment.id);
    if (!record) return { type: "text", text: `[Image no longer available: ${attachment.name}]` };
    return { type: "image", mimeType: attachment.mimeType, data: await blobToBase64(record.blob) };
  }

  if (attachment.kind === "pdf" && capabilities.supportsFiles && adapter.supportsFeature("native-pdf")) {
    const record = await getStorage().get("blobs", attachment.id);
    if (record) {
      return { type: "document", mimeType: "application/pdf", data: await blobToBase64(record.blob), name: attachment.name };
    }
  }
  return { type: "text", text: fileAsText(attachment) };
}

/**
 * Everything that frames a chat, in order: its own instructions, its project's instructions
 * and files, and the summary of the chat it continues. Empty parts are left out.
 */
export function composeSystem(base: string | undefined, folder: Folder | undefined, conversation: Pick<Conversation, "summary">): string | undefined {
  const parts: string[] = [];
  if (base?.trim()) parts.push(base.trim());
  if (folder?.instructions?.trim()) parts.push(`Project "${folder.name}" instructions:\n${folder.instructions.trim()}`);
  if (folder?.files?.length) parts.push(`Project files:\n${folder.files.map(fileAsText).join("\n")}`);
  if (conversation.summary?.trim()) parts.push(`This chat continues an earlier one. Summary of it:\n${conversation.summary.trim()}`);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/** Converts stored messages into the provider-neutral shape adapters consume. */
export async function buildChatMessages(
  messages: readonly Message[],
  capabilities: ModelCapabilities,
  adapter: Pick<ProviderAdapter, "supportsFeature">,
): Promise<ChatMessage[]> {
  const result: ChatMessage[] = [];
  // Providers reject a tool call with no result after it, so only answered calls are sent.
  const answered = new Set(messages.flatMap((message) => (message.role === "tool" ? (message.toolResults ?? []).map((item) => item.toolCallId) : [])));

  for (const message of messages) {
    if (message.role === "tool") {
      for (const toolResult of message.toolResults ?? []) result.push({ role: "tool", parts: [], toolResult });
      continue;
    }
    if (message.role !== "user" && message.role !== "assistant") continue;
    const toolCalls = message.role === "assistant" ? message.toolCalls?.filter((call) => answered.has(call.id)) : undefined;
    // Empty turns are rejected by several APIs.
    if (!message.content.trim() && !message.attachments?.length && !toolCalls?.length) continue;

    const parts: ChatPart[] = [];
    for (const attachment of message.attachments ?? []) {
      parts.push(await attachmentPart(attachment, capabilities, adapter));
    }
    if (message.content) parts.push({ type: "text", text: message.content });
    result.push({ role: message.role, parts, ...(toolCalls?.length ? { toolCalls } : {}) });
  }
  return result;
}
