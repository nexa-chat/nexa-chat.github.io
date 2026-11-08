import type { Message } from "@/types";
import { sortMessages, type StorageAdapter, type StoreName, type StoreRecords } from "./adapter";

/** In-memory storage for tests, and the fallback when a browser blocks IndexedDB. */
export class MemoryStorage implements StorageAdapter {
  private readonly stores = new Map<StoreName, Map<string, unknown>>();

  private store(name: StoreName): Map<string, unknown> {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    return store;
  }

  async get<K extends StoreName>(store: K, id: string): Promise<StoreRecords[K] | undefined> {
    return this.store(store).get(id) as StoreRecords[K] | undefined;
  }

  async getAll<K extends StoreName>(store: K): Promise<StoreRecords[K][]> {
    return [...this.store(store).values()] as StoreRecords[K][];
  }

  async put<K extends StoreName>(store: K, record: StoreRecords[K]): Promise<void> {
    this.store(store).set(record.id, record);
  }

  async putMany<K extends StoreName>(store: K, records: readonly StoreRecords[K][]): Promise<void> {
    for (const record of records) this.store(store).set(record.id, record);
  }

  async delete(store: StoreName, id: string): Promise<void> {
    this.store(store).delete(id);
  }

  async deleteMany(store: StoreName, ids: readonly string[]): Promise<void> {
    for (const id of ids) this.store(store).delete(id);
  }

  async clear(store: StoreName): Promise<void> {
    this.store(store).clear();
  }

  async messagesFor(conversationId: string): Promise<Message[]> {
    const messages = await this.getAll("messages");
    return sortMessages(messages.filter((message) => message.conversationId === conversationId));
  }
}
