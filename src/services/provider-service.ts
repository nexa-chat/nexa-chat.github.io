import { inferCapabilities, prettifyModelName } from "@/lib/capabilities";
import { createId } from "@/lib/ids";
import { keyHint } from "@/lib/redact";
import { normalizeBaseUrl } from "@/lib/url";
import { providerRegistry, type ConnectionResult, type ProviderAdapter, type RemoteModel } from "@/providers";
import { getStorage, getVault } from "@/storage";
import type { ModelConfig, ProviderConfig, ProviderSecrets } from "@/types";

export interface ProviderDraft {
  id?: string;
  name: string;
  apiType: ProviderConfig["apiType"];
  presetId?: string;
  baseUrl: string;
  headers: ProviderConfig["headers"];
  advanced: ProviderConfig["advanced"];
  connection: ProviderConfig["connection"];
  /** Undefined keeps the stored key. An empty string removes it. */
  apiKey?: string;
  /** Values of secret headers, keyed by header id. */
  secretHeaders: Record<string, string>;
}

export function draftToConfig(draft: ProviderDraft, existing?: ProviderConfig): ProviderConfig {
  const now = Date.now();
  return {
    id: draft.id ?? existing?.id ?? createId("prv"),
    name: draft.name.trim(),
    apiType: draft.apiType,
    presetId: draft.presetId,
    baseUrl: normalizeBaseUrl(draft.baseUrl),
    headers: draft.headers
      .filter((header) => header.name.trim().length > 0)
      .map((header) => ({ ...header, name: header.name.trim(), value: header.secret ? "" : header.value })),
    advanced: draft.advanced,
    connection: draft.connection,
    health: existing?.health ?? "not_tested",
    healthDetail: existing?.healthDetail,
    lastTestedAt: existing?.lastTestedAt,
    keyHint: existing?.keyHint,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function mergedSecrets(draft: ProviderDraft, providerId: string): Promise<ProviderSecrets> {
  const stored = draft.id ? await getVault().get(providerId) : {};
  return {
    apiKey: draft.apiKey ?? stored.apiKey,
    headers: { ...stored.headers, ...draft.secretHeaders },
  };
}

export async function saveProvider(draft: ProviderDraft, existing?: ProviderConfig): Promise<ProviderConfig> {
  const config = draftToConfig(draft, existing);
  const secrets = await mergedSecrets(draft, config.id);
  await getVault().set(config.id, secrets);

  const saved: ProviderConfig = { ...config, keyHint: secrets.apiKey ? keyHint(secrets.apiKey) : undefined };
  await getStorage().put("providers", saved);
  return saved;
}

export async function deleteProvider(id: string): Promise<void> {
  const storage = getStorage();
  const models = await storage.getAll("models");
  await storage.deleteMany("models", models.filter((model) => model.providerId === id).map((model) => model.id));
  await getVault().delete(id);
  await storage.delete("providers", id);
}

export async function createAdapter(provider: ProviderConfig): Promise<ProviderAdapter> {
  const secrets = await getVault().get(provider.id);
  return providerRegistry.create({ config: provider, secrets });
}

/** Tests unsaved form values: nothing is written until the user saves. */
export async function testDraft(draft: ProviderDraft, modelId: string | undefined, signal?: AbortSignal): Promise<ConnectionResult> {
  const config = draftToConfig(draft);
  const secrets = await mergedSecrets(draft, config.id);
  const adapter = providerRegistry.create({ config, secrets });
  return adapter.validateConnection(modelId?.trim() || undefined, signal);
}

export function healthFromResult(result: ConnectionResult): Pick<ProviderConfig, "health" | "healthDetail" | "lastTestedAt"> {
  const lastTestedAt = Date.now();
  if (result.ok) return { health: "connected", healthDetail: undefined, lastTestedAt };
  const code = result.error?.code;
  return {
    health: code === "rate_limited" ? "rate_limited" : "error",
    healthDetail: result.error?.title,
    lastTestedAt,
  };
}

export function modelFromRemote(providerId: string, apiType: ProviderConfig["apiType"], modelId: string, remote?: RemoteModel): ModelConfig {
  const now = Date.now();
  return {
    id: createId("mdl"),
    providerId,
    name: remote?.name?.trim() || prettifyModelName(modelId),
    modelId: modelId.trim(),
    capabilities: { ...inferCapabilities(apiType, modelId), ...remote?.capabilities },
    parameters: {},
    unsupportedParams: [],
    pricing: remote?.pricing,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}
