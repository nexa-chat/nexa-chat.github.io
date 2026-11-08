import type { Conversation, Folder, Message, ModelConfig, ProviderConfig, SavedPrompt } from "@/types";

export interface KeyValueRecord {
  id: string;
  value: unknown;
}

export interface SecretRecord {
  id: string;
  iv?: Uint8Array;
  data?: ArrayBuffer;
  key?: CryptoKey;
}

export interface BlobRecord {
  id: string;
  blob: Blob;
}

export interface StoreRecords {
  conversations: Conversation;
  messages: Message;
  providers: ProviderConfig;
  models: ModelConfig;
  folders: Folder;
  prompts: SavedPrompt;
  settings: KeyValueRecord;
  secrets: SecretRecord;
  blobs: BlobRecord;
}

export type StoreName = keyof StoreRecords;

export const STORE_NAMES: readonly StoreName[] = [
  "conversations",
  "messages",
  "providers",
  "models",
  "folders",
  "prompts",
  "settings",
  "secrets",
  "blobs",
];

/**
 * Everything the app persists goes through this interface. IndexedDBStorage is the only
 * production implementation today; a CloudStorage can implement the same contract later.
 */
export interface StorageAdapter {
  get<K extends StoreName>(store: K, id: string): Promise<StoreRecords[K] | undefined>;
  getAll<K extends StoreName>(store: K): Promise<StoreRecords[K][]>;
  put<K extends StoreName>(store: K, record: StoreRecords[K]): Promise<void>;
  putMany<K extends StoreName>(store: K, records: readonly StoreRecords[K][]): Promise<void>;
  delete(store: StoreName, id: string): Promise<void>;
  deleteMany(store: StoreName, ids: readonly string[]): Promise<void>;
  clear(store: StoreName): Promise<void>;
  /** Messages of one conversation, oldest first. */
  messagesFor(conversationId: string): Promise<Message[]>;
}

export function sortMessages(messages: Message[]): Message[] {
  return messages.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
