import type { StorageAdapter } from "./adapter";
import { IndexedDBStorage } from "./indexeddb";
import { MemoryStorage } from "./memory";
import { SecretVault } from "./vault";

export * from "./adapter";
export { IndexedDBStorage, MemoryStorage, SecretVault };

let storage: StorageAdapter | undefined;
let vault: SecretVault | undefined;
let persistent = true;

/** Probes IndexedDB once, and falls back to memory where the browser blocks it. */
export async function initStorage(): Promise<{ persistent: boolean }> {
  if (storage) return { persistent };
  const candidate = new IndexedDBStorage();
  try {
    await candidate.getAll("settings");
    storage = candidate;
  } catch {
    storage = new MemoryStorage();
    persistent = false;
  }
  return { persistent };
}

export function getStorage(): StorageAdapter {
  storage ??= new IndexedDBStorage();
  return storage;
}

export function getVault(): SecretVault {
  vault ??= new SecretVault(getStorage());
  return vault;
}

/** Test seam: lets a test run the real services against an isolated store. */
export function setStorageForTesting(next: StorageAdapter): void {
  storage = next;
  vault = new SecretVault(next);
  persistent = true;
}
