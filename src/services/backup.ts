import { getStorage, getVault, type KeyValueRecord } from "@/storage";
import type { Conversation, Folder, Message, ModelConfig, ProviderConfig, ProviderSecrets, SavedPrompt } from "@/types";
import { base64ToBlob, blobToBase64 } from "./files";

export const BACKUP_FORMAT = "nexa-backup";
export const BACKUP_VERSION = 1;

interface BackupBlob {
  id: string;
  mimeType: string;
  data: string;
}

export interface NexaBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  conversations: Conversation[];
  messages: Message[];
  providers: ProviderConfig[];
  models: ModelConfig[];
  folders: Folder[];
  prompts: SavedPrompt[];
  settings: KeyValueRecord[];
  blobs: BackupBlob[];
  /** Only present when the user explicitly chose to include keys. */
  secrets?: Record<string, ProviderSecrets>;
}

export interface BackupOptions {
  includeKeys: boolean;
}

export async function createBackup({ includeKeys }: BackupOptions): Promise<NexaBackup> {
  const storage = getStorage();
  const [conversations, messages, providers, models, folders, prompts, settings, blobRecords] = await Promise.all([
    storage.getAll("conversations"),
    storage.getAll("messages"),
    storage.getAll("providers"),
    storage.getAll("models"),
    storage.getAll("folders"),
    storage.getAll("prompts"),
    storage.getAll("settings"),
    storage.getAll("blobs"),
  ]);

  const blobs = await Promise.all(
    blobRecords.map(async (record) => ({ id: record.id, mimeType: record.blob.type, data: await blobToBase64(record.blob) })),
  );

  const backup: NexaBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    conversations,
    messages,
    providers,
    models,
    folders,
    prompts,
    settings,
    blobs,
  };

  if (includeKeys) {
    const vault = getVault();
    const entries = await Promise.all(providers.map(async (provider) => [provider.id, await vault.get(provider.id)] as const));
    backup.secrets = Object.fromEntries(entries);
  }
  return backup;
}

export class BackupError extends Error {}

function isRecordList(value: unknown, required: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "object" && item !== null && required.every((key) => key in item))
  );
}

/** Validates an untrusted file before anything touches the database. */
export function parseBackup(text: string): NexaBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError("This file isn't valid JSON.");
  }

  const backup = parsed as Partial<NexaBackup> | null;
  if (typeof backup !== "object" || backup === null || backup.format !== BACKUP_FORMAT) {
    throw new BackupError("This isn't a NEXA backup file.");
  }
  if (typeof backup.version !== "number" || backup.version > BACKUP_VERSION) {
    throw new BackupError("This backup was made by a newer version of NEXA.");
  }

  const checks: [unknown, readonly string[]][] = [
    [backup.conversations, ["id", "title"]],
    [backup.messages, ["id", "conversationId", "role", "content"]],
    [backup.providers, ["id", "name", "apiType", "baseUrl"]],
    [backup.models, ["id", "providerId", "modelId"]],
  ];
  if (!checks.every(([value, keys]) => isRecordList(value, keys))) {
    throw new BackupError("This backup is damaged or incomplete.");
  }

  return {
    ...backup,
    folders: backup.folders ?? [],
    prompts: backup.prompts ?? [],
    settings: backup.settings ?? [],
    blobs: backup.blobs ?? [],
  } as NexaBackup;
}

export interface BackupPreview {
  exportedAt: number;
  conversations: number;
  messages: number;
  providers: number;
  models: number;
  prompts: number;
  includesKeys: boolean;
  /** Records in the file whose ID already exists here. */
  conflicts: number;
}

export async function previewBackup(backup: NexaBackup): Promise<BackupPreview> {
  const existing = new Set((await getStorage().getAll("conversations")).map((item) => item.id));
  return {
    exportedAt: backup.exportedAt,
    conversations: backup.conversations.length,
    messages: backup.messages.length,
    providers: backup.providers.length,
    models: backup.models.length,
    prompts: backup.prompts.length,
    includesKeys: Boolean(backup.secrets && Object.keys(backup.secrets).length > 0),
    conflicts: backup.conversations.filter((item) => existing.has(item.id)).length,
  };
}

export type ImportMode = "merge" | "replace";

/** "merge" keeps existing records and adds what is new. "replace" clears the database first. */
export async function applyBackup(backup: NexaBackup, mode: ImportMode): Promise<void> {
  const storage = getStorage();

  if (mode === "replace") {
    await Promise.all(
      (["conversations", "messages", "providers", "models", "folders", "prompts", "blobs"] as const).map((store) => storage.clear(store)),
    );
    await getVault().clear();
  }

  const existing = new Set((await storage.getAll("conversations")).map((item) => item.id));
  const conversations = backup.conversations.filter((item) => !existing.has(item.id));
  const newIds = new Set(conversations.map((item) => item.id));

  const existingProviders = new Set((await storage.getAll("providers")).map((item) => item.id));
  const providers = backup.providers.filter((item) => !existingProviders.has(item.id));

  const existingModels = new Set((await storage.getAll("models")).map((item) => item.id));
  const models = backup.models.filter((item) => !existingModels.has(item.id));

  await storage.putMany("conversations", conversations);
  await storage.putMany("messages", backup.messages.filter((message) => newIds.has(message.conversationId)));
  await storage.putMany("providers", providers);
  await storage.putMany("models", models);
  await storage.putMany("folders", backup.folders);
  await storage.putMany("prompts", backup.prompts);
  if (mode === "replace") await storage.putMany("settings", backup.settings);

  await storage.putMany(
    "blobs",
    backup.blobs.map((blob) => ({ id: blob.id, blob: base64ToBlob(blob.data, blob.mimeType) })),
  );

  for (const provider of providers) {
    const secrets = backup.secrets?.[provider.id];
    if (secrets) await getVault().set(provider.id, secrets);
  }
}
