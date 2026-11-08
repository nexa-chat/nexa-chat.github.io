import type { PresetId } from "./provider";
import type { ToolCall, ToolResult } from "./tools";

export type Role = "system" | "user" | "assistant" | "tool";
export type MessageStatus = "complete" | "streaming" | "stopped" | "error";
export type AttachmentKind = "image" | "pdf" | "text";

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  /** Text extracted in the browser, sent to models that cannot read the file natively. */
  extractedText?: string;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface SerializedError {
  code: string;
  title: string;
  message: string;
  action?: string;
  status?: number;
  retryable: boolean;
  details?: string;
}

export interface MessageModelRef {
  modelConfigId: string;
  modelName: string;
  providerName: string;
  /** Where this message was sent. */
  host?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  /** The message this one answers. null for a root, undefined for chats saved before branches. */
  parentId?: string | null;
  role: Role;
  content: string;
  reasoning?: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  status: MessageStatus;
  error?: SerializedError;
  finishReason?: string;
  usage?: Usage;
  /** Local estimate based on the prices the user entered. */
  estimatedCost?: number;
  model?: MessageModelRef;
  /** Kept in the saved answers list. */
  saved?: boolean;
  /** Shown in the bar of pinned messages at the top of its chat. */
  pinned?: boolean;
  /** Set when the chosen model failed and the fallback model answered instead. */
  fellBackFrom?: { modelName: string; reason: string };
  /** Old thumbs. No longer written: a thumbs up reads as saved. */
  feedback?: "good" | "bad";
  createdAt: number;
  updatedAt: number;
}

export type TitleSource = "pending" | "auto" | "ai" | "user";
export type SystemPresetId = "default" | "coding" | "writing" | "research" | "custom";

export interface Conversation {
  id: string;
  title: string;
  titleSource: TitleSource;
  modelConfigId?: string;
  providerId?: string;
  systemPreset: SystemPresetId;
  systemPrompt: string;
  preset: PresetId;
  folderId?: string;
  favorite: boolean;
  archived: boolean;
  messageCount: number;
  /** The last message of the branch on screen. Unset means the newest branch. */
  activeLeafId?: string;
  /** A summary of the chat this one continues, sent ahead of the messages. */
  summary?: string;
  /** The chat this one continues from, which stays as it was. */
  summaryOf?: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, string>;
}

/** A folder, and also a project: its instructions and files start every chat inside it. */
export interface Folder {
  id: string;
  name: string;
  instructions?: string;
  /** Text files, read in the browser, sent with each message of the project's chats. */
  files?: Attachment[];
  createdAt: number;
}

export interface SavedPrompt {
  id: string;
  name: string;
  prompt: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}
