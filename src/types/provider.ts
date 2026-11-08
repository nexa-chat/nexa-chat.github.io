export type ApiType = "openai" | "anthropic" | "gemini" | "openrouter" | "custom-http";
export type ConnectionMode = "direct" | "relay";
export type ProviderHealth = "not_tested" | "connected" | "error" | "rate_limited";
export type AuthType = "bearer" | "api-key-header" | "basic" | "custom" | "none";
export type StreamFormat = "sse" | "ndjson" | "none";
export type HttpMethod = "POST" | "PUT";

export interface HeaderEntry {
  id: string;
  name: string;
  /** Empty for secret headers: their value lives in the vault. */
  value: string;
  secret: boolean;
}

export interface QueryParam {
  id: string;
  name: string;
  value: string;
}

export interface ProviderAdvanced {
  /** Overrides the default chat path, relative to the base URL. */
  endpointPath?: string;
  /** Overrides the default model list path, relative to the base URL. */
  modelsPath?: string;
  method?: HttpMethod;
  streamFormat?: StreamFormat;
  authType?: AuthType;
  /** Header that carries the key for "api-key-header" and "custom" auth. */
  authHeaderName?: string;
  /** Prefix placed before the key for "custom" auth, for example "Token ". */
  authPrefix?: string;
  queryParams?: QueryParam[];
  anthropicVersion?: string;
  /** Custom HTTP only: JSON body template with {{model}}, {{messages}}, {{prompt}}, {{stream}}. */
  bodyTemplate?: string;
  /** Custom HTTP only: dot path to the text in a response or stream chunk. */
  responseTextPath?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  apiType: ApiType;
  presetId?: string;
  baseUrl: string;
  headers: HeaderEntry[];
  advanced: ProviderAdvanced;
  connection: ConnectionMode;
  health: ProviderHealth;
  healthDetail?: string;
  lastTestedAt?: number;
  /** Last four characters of the key, shown in masked form. Never the key itself. */
  keyHint?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderSecrets {
  apiKey?: string;
  /** Values of secret headers, keyed by HeaderEntry.id. */
  headers?: Record<string, string>;
}

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  supportsImages: boolean;
  supportsFiles: boolean;
}

export interface ModelPricing {
  /** Price per million input tokens, in the user's own currency. */
  inputPerMTok?: number;
  outputPerMTok?: number;
}

export interface GenerationParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoning?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
}

export interface ModelConfig {
  id: string;
  providerId: string;
  name: string;
  /** The identifier sent to the provider. */
  modelId: string;
  /** Overrides the provider's chat endpoint for this model only. */
  endpoint?: string;
  capabilities: ModelCapabilities;
  parameters: GenerationParams;
  /** Parameters this model rejected at runtime. They are never sent again. */
  unsupportedParams: string[];
  pricing?: ModelPricing;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PresetId = "fast" | "balanced" | "reasoning" | "creative" | "custom";
