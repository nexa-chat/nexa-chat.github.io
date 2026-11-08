import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBStorage, MemoryStorage, SecretVault, type StorageAdapter } from "@/storage";
import type { Message } from "@/types";

function message(id: string, conversationId: string, createdAt: number): Message {
  return { id, conversationId, role: "user", content: id, status: "complete", createdAt, updatedAt: createdAt };
}

describe.each([
  ["IndexedDBStorage", () => new IndexedDBStorage()],
  ["MemoryStorage", () => new MemoryStorage()],
])("%s", (_, create: () => StorageAdapter) => {
  let storage: StorageAdapter;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    storage = create();
  });

  it("stores and reads a record", async () => {
    await storage.put("settings", { id: "a", value: 1 });
    expect(await storage.get("settings", "a")).toEqual({ id: "a", value: 1 });
    expect(await storage.get("settings", "missing")).toBeUndefined();
  });

  it("replaces a record with the same id", async () => {
    await storage.put("settings", { id: "a", value: 1 });
    await storage.put("settings", { id: "a", value: 2 });
    expect(await storage.getAll("settings")).toEqual([{ id: "a", value: 2 }]);
  });

  it("writes and deletes in bulk", async () => {
    await storage.putMany("settings", [{ id: "a", value: 1 }, { id: "b", value: 2 }, { id: "c", value: 3 }]);
    await storage.deleteMany("settings", ["a", "b"]);
    expect((await storage.getAll("settings")).map((record) => record.id)).toEqual(["c"]);
  });

  it("returns one conversation's messages, oldest first", async () => {
    await storage.putMany("messages", [message("m2", "c1", 2), message("m1", "c1", 1), message("x", "c2", 1)]);
    expect((await storage.messagesFor("c1")).map((item) => item.id)).toEqual(["m1", "m2"]);
  });

  it("clears a store without touching others", async () => {
    await storage.put("settings", { id: "a", value: 1 });
    await storage.put("messages", message("m", "c", 1));
    await storage.clear("settings");
    expect(await storage.getAll("settings")).toEqual([]);
    expect(await storage.getAll("messages")).toHaveLength(1);
  });
});

describe("SecretVault", () => {
  it("round-trips secrets", async () => {
    const vault = new SecretVault(new MemoryStorage());
    await vault.set("p1", { apiKey: "sk-secret", headers: { h: "v" } });
    expect(await vault.get("p1")).toEqual({ apiKey: "sk-secret", headers: { h: "v" } });
  });

  it("stores no plaintext", async () => {
    const storage = new MemoryStorage();
    await new SecretVault(storage).set("p1", { apiKey: "sk-secret-value" });
    const record = await storage.get("secrets", "p1");
    expect(record?.data).toBeDefined();
    expect(new TextDecoder().decode(record?.data)).not.toContain("sk-secret-value");
  });

  it("uses a fresh IV for each write", async () => {
    const storage = new MemoryStorage();
    const vault = new SecretVault(storage);
    await vault.set("a", { apiKey: "same" });
    await vault.set("b", { apiKey: "same" });
    const [first, second] = [await storage.get("secrets", "a"), await storage.get("secrets", "b")];
    expect(first?.iv).not.toEqual(second?.iv);
  });

  it("uses a key the page cannot export", async () => {
    const storage = new MemoryStorage();
    await new SecretVault(storage).set("p1", { apiKey: "x" });
    const record = await storage.get("secrets", "__vault_key__");
    expect(record?.key?.extractable).toBe(false);
  });

  it("decrypts across instances sharing a store", async () => {
    const storage = new MemoryStorage();
    await new SecretVault(storage).set("p1", { apiKey: "persisted" });
    expect(await new SecretVault(storage).get("p1")).toEqual({ apiKey: "persisted" });
  });

  it("returns nothing for an unknown provider", async () => {
    expect(await new SecretVault(new MemoryStorage()).get("none")).toEqual({});
  });

  it("deletes secrets", async () => {
    const vault = new SecretVault(new MemoryStorage());
    await vault.set("p1", { apiKey: "x" });
    await vault.delete("p1");
    expect(await vault.get("p1")).toEqual({});
  });
});
