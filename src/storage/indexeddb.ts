import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Message } from "@/types";
import { STORE_NAMES, sortMessages, type StorageAdapter, type StoreName, type StoreRecords } from "./adapter";

const DB_NAME = "nexa";
const DB_VERSION = 1;

interface NexaSchema extends DBSchema {
  conversations: { key: string; value: StoreRecords["conversations"] };
  messages: { key: string; value: Message; indexes: { conversationId: string } };
  providers: { key: string; value: StoreRecords["providers"] };
  models: { key: string; value: StoreRecords["models"] };
  folders: { key: string; value: StoreRecords["folders"] };
  prompts: { key: string; value: StoreRecords["prompts"] };
  settings: { key: string; value: StoreRecords["settings"] };
  secrets: { key: string; value: StoreRecords["secrets"] };
  blobs: { key: string; value: StoreRecords["blobs"] };
}

export class IndexedDBStorage implements StorageAdapter {
  private database: Promise<IDBPDatabase<NexaSchema>> | undefined;

  private db(): Promise<IDBPDatabase<NexaSchema>> {
    this.database ??= openDB<NexaSchema>(DB_NAME, DB_VERSION, {
      upgrade(database, _oldVersion, _newVersion, transaction) {
        for (const name of STORE_NAMES) {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "id" });
        }
        const messages = transaction.objectStore("messages");
        if (!messages.indexNames.contains("conversationId")) messages.createIndex("conversationId", "conversationId");
      },
    });
    return this.database;
  }

  async get<K extends StoreName>(store: K, id: string): Promise<StoreRecords[K] | undefined> {
    return (await this.db()).get(store, id) as Promise<StoreRecords[K] | undefined>;
  }

  async getAll<K extends StoreName>(store: K): Promise<StoreRecords[K][]> {
    return (await this.db()).getAll(store) as Promise<StoreRecords[K][]>;
  }

  async put<K extends StoreName>(store: K, record: StoreRecords[K]): Promise<void> {
    await (await this.db()).put(store, record as never);
  }

  async putMany<K extends StoreName>(store: K, records: readonly StoreRecords[K][]): Promise<void> {
    const transaction = (await this.db()).transaction(store, "readwrite");
    await Promise.all([...records.map((record) => transaction.store.put(record as never)), transaction.done]);
  }

  async delete(store: StoreName, id: string): Promise<void> {
    await (await this.db()).delete(store, id);
  }

  async deleteMany(store: StoreName, ids: readonly string[]): Promise<void> {
    const transaction = (await this.db()).transaction(store, "readwrite");
    await Promise.all([...ids.map((id) => transaction.store.delete(id)), transaction.done]);
  }

  async clear(store: StoreName): Promise<void> {
    await (await this.db()).clear(store);
  }

  async messagesFor(conversationId: string): Promise<Message[]> {
    const messages = await (await this.db()).getAllFromIndex("messages", "conversationId", conversationId);
    return sortMessages(messages);
  }
}
