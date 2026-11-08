import { NexaError } from "@/lib/errors";
import type { ProviderSecrets } from "@/types";
import type { StorageAdapter } from "./adapter";

const KEY_RECORD_ID = "__vault_key__";

/**
 * Encrypts provider secrets at rest with AES-GCM under a non-extractable key held by the
 * browser. The database never contains a key in plaintext, and script cannot read the raw
 * AES key. This protects data at rest. It does not stop code running on this origin, which
 * can ask the browser to decrypt. SECURITY.md describes that boundary.
 */
export class SecretVault {
  private cryptoKey: Promise<CryptoKey> | undefined;

  constructor(private readonly storage: StorageAdapter) {}

  private subtle(): SubtleCrypto {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new NexaError("config", { message: "Keys can only be stored on a secure (https) connection." });
    }
    return crypto.subtle;
  }

  private key(): Promise<CryptoKey> {
    this.cryptoKey ??= this.loadOrCreateKey().catch((error: unknown) => {
      this.cryptoKey = undefined;
      throw error;
    });
    return this.cryptoKey;
  }

  private async loadOrCreateKey(): Promise<CryptoKey> {
    const existing = await this.storage.get("secrets", KEY_RECORD_ID);
    if (existing?.key) return existing.key;

    const key = await this.subtle().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await this.storage.put("secrets", { id: KEY_RECORD_ID, key });
    return key;
  }

  async set(id: string, secrets: ProviderSecrets): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(secrets));
    const data = await this.subtle().encrypt({ name: "AES-GCM", iv }, await this.key(), plaintext);
    await this.storage.put("secrets", { id, iv, data });
  }

  async get(id: string): Promise<ProviderSecrets> {
    const record = await this.storage.get("secrets", id);
    if (!record?.iv || !record.data) return {};
    try {
      const iv = new Uint8Array(record.iv);
      const plaintext = await this.subtle().decrypt({ name: "AES-GCM", iv }, await this.key(), record.data);
      return JSON.parse(new TextDecoder().decode(plaintext)) as ProviderSecrets;
    } catch {
      throw new NexaError("config", { message: "This provider's key can't be read. Enter it again in Settings." });
    }
  }

  async delete(id: string): Promise<void> {
    await this.storage.delete("secrets", id);
  }

  /** Removes every stored secret and the encryption key itself. */
  async clear(): Promise<void> {
    this.cryptoKey = undefined;
    await this.storage.clear("secrets");
  }
}
