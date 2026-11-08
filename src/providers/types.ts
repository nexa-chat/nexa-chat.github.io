import type { FetchImpl } from "@/lib/http";
import type { NexaError } from "@/lib/errors";
import type {
  ApiType,
  GenerationParams,
  ModelCapabilities,
  ModelConfig,
  ModelPricing,
  ProviderConfig,
  ProviderSecrets,
  ToolCall,
  ToolDefinition,
  ToolResult,
  Usage,
} from "@/types";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "document"; mimeType: string; data: string; name: string };

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  parts: ChatPart[];
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

export interface ChatRequest {
  model: Pick<ModelConfig, "modelId" | "capabilities" | "unsupportedParams" | "endpoint">;
  system?: string;
  messages: ChatMessage[];
  params: GenerationParams;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "refusal" | "other";

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_call"; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: "usage"; usage: Usage }
  | { type: "finish"; reason: FinishReason }
  /** The provider rejected a parameter, and the request was resent without it. */
  | { type: "param_dropped"; param: string };

export interface ChatResult {
  text: string;
  reasoning: string;
  toolCalls: ToolCall[];
  usage?: Usage;
  finishReason?: FinishReason;
}

export interface RemoteModel {
  id: string;
  name?: string;
  capabilities?: Partial<ModelCapabilities>;
  pricing?: ModelPricing;
}

export interface ConnectionResult {
  ok: boolean;
  latencyMs: number;
  error?: NexaError;
  models?: RemoteModel[];
  /** False when the connection works but the provider's list doesn't include the model. */
  modelListed?: boolean;
}

export type ProviderFeature = "model-list" | "native-pdf" | "tools" | "reasoning" | "vision" | "streaming";

export interface ProviderAdapter {
  readonly apiType: ApiType;
  /** Checks the configuration without touching the network. Throws a NexaError if unusable. */
  initialize(): void;
  /** Uses the free model list when it can, and spends a tiny request only if it must. */
  validateConnection(modelId?: string, signal?: AbortSignal): Promise<ConnectionResult>;
  sendMessage(request: ChatRequest): Promise<ChatResult>;
  streamMessage(request: ChatRequest): AsyncGenerator<StreamEvent>;
  listModels(signal?: AbortSignal): Promise<RemoteModel[]>;
  supportsFeature(feature: ProviderFeature): boolean;
  normalizeError(error: unknown): NexaError;
  /** The address chat requests go to, for display and for the wire. */
  resolveChatUrl(modelId: string, stream: boolean): string;
}

export interface AdapterContext {
  config: ProviderConfig;
  secrets: ProviderSecrets;
  fetchImpl?: FetchImpl;
}

export interface ProviderDefinition {
  apiType: ApiType;
  label: string;
  create(context: AdapterContext): ProviderAdapter;
}
