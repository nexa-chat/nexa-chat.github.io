import type { SerializedError } from "@/types";
import { redactSecrets } from "./redact";

export type ErrorCode =
  | "bad_request"
  | "invalid_api_key"
  | "access_denied"
  | "not_found"
  | "model_not_found"
  | "invalid_endpoint"
  | "timeout"
  | "rate_limited"
  | "quota_exceeded"
  | "context_too_long"
  | "provider_error"
  | "bad_gateway"
  | "unavailable"
  | "cors"
  | "mixed_content"
  | "network"
  | "offline"
  | "malformed_response"
  | "stream_interrupted"
  | "aborted"
  | "config"
  | "relay_unavailable"
  | "unknown";

interface ErrorCopy {
  title: string;
  message: string;
  action?: string;
  retryable: boolean;
}

export const ERROR_COPY: Record<ErrorCode, ErrorCopy> = {
  bad_request: { title: "Bad request", message: "The provider rejected this request.", action: "Check the model settings, then try again.", retryable: false },
  invalid_api_key: { title: "Invalid API key", message: "The provider did not accept this key.", action: "Check the key in Settings, under Providers.", retryable: false },
  access_denied: { title: "Access denied", message: "This key is valid but has no access to this resource.", action: "Check the key's permissions with your provider.", retryable: false },
  not_found: { title: "Model or endpoint not found", message: "The provider has no model or endpoint at this address.", action: "Check the base URL and the model ID.", retryable: false },
  model_not_found: { title: "Model not found", message: "The provider does not recognise this model ID.", action: "Pick a model from the provider's list or correct the ID.", retryable: false },
  invalid_endpoint: { title: "Invalid endpoint", message: "Nothing answers at this address.", action: "Check the base URL. It usually ends in /v1.", retryable: false },
  timeout: { title: "Request timeout", message: "The provider took too long to answer.", action: "Try again, or raise the timeout in Settings, under Advanced.", retryable: true },
  rate_limited: { title: "Rate limit exceeded", message: "You've sent too many requests to this provider.", action: "Wait a moment before trying again.", retryable: true },
  quota_exceeded: { title: "Out of credit", message: "This account has no remaining credit or quota.", action: "Check billing with your provider.", retryable: false },
  context_too_long: { title: "Conversation too long", message: "This conversation no longer fits in the model's context window.", action: "Start a new chat or pick a model with a larger context.", retryable: false },
  provider_error: { title: "Provider error", message: "The provider failed while handling this request.", action: "Try again in a moment.", retryable: true },
  bad_gateway: { title: "Bad gateway", message: "A server between you and the provider returned an invalid response.", action: "Try again in a moment.", retryable: true },
  unavailable: { title: "Provider unavailable", message: "The provider is overloaded or down.", action: "Try again in a moment, or switch models.", retryable: true },
  cors: { title: "Browser blocked this request", message: "This provider does not allow browser requests from this domain.", action: "Use a compatible endpoint or enable a secure proxy.", retryable: false },
  mixed_content: { title: "Insecure endpoint blocked", message: "Browsers block http:// endpoints from an https:// page, except localhost.", action: "Use an https:// endpoint.", retryable: false },
  network: { title: "Can't reach the provider", message: "No connection could be made to this address.", action: "Check the base URL and your network.", retryable: true },
  offline: { title: "You're offline", message: "Your device has no internet connection.", action: "Reconnect, then try again.", retryable: true },
  malformed_response: { title: "Unreadable response", message: "The provider answered in a format NEXA could not read.", action: "Check the API type for this provider.", retryable: false },
  stream_interrupted: { title: "Response interrupted", message: "The connection dropped before the response finished.", action: "Retry, or use Continue to pick up where it stopped.", retryable: true },
  aborted: { title: "Stopped", message: "Generation was stopped.", retryable: false },
  config: { title: "Setup needed", message: "This model is not fully set up.", action: "Finish the setup in Settings.", retryable: false },
  relay_unavailable: { title: "Relay unavailable", message: "This deployment has no relay, so the request was not sent.", action: "Switch the provider to a direct connection.", retryable: false },
  unknown: { title: "Something went wrong", message: "The request failed for an unknown reason.", action: "Try again. Show details has more information.", retryable: true },
};

export interface NexaErrorOptions {
  status?: number;
  details?: string;
  message?: string;
  retryAfterMs?: number;
}

export class NexaError extends Error {
  readonly code: ErrorCode;
  readonly title: string;
  readonly action?: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly details?: string;
  readonly retryAfterMs?: number;

  constructor(code: ErrorCode, options: NexaErrorOptions = {}) {
    const copy = ERROR_COPY[code];
    super(options.message ?? copy.message);
    this.name = "NexaError";
    this.code = code;
    this.title = copy.title;
    this.action = copy.action;
    this.status = options.status;
    this.retryable = copy.retryable;
    this.details = options.details === undefined ? undefined : redactSecrets(options.details).slice(0, 2000);
    this.retryAfterMs = options.retryAfterMs;
  }

  toJSON(): SerializedError {
    return {
      code: this.code,
      title: this.title,
      message: this.message,
      action: this.action,
      status: this.status,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof NexaError && error.code === "aborted") ||
    (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError")
  );
}

function codeForStatus(status: number, body: string): ErrorCode {
  const text = body.toLowerCase();
  if (/context[_ ]length|too many tokens|prompt is too long|maximum context/.test(text)) return "context_too_long";
  if (/insufficient_quota|insufficient credit|credit balance|billing|out of credit/.test(text)) return "quota_exceeded";
  switch (status) {
    case 400:
    case 422:
      return "bad_request";
    case 401:
      return "invalid_api_key";
    case 402:
      return "quota_exceeded";
    case 403:
      return "access_denied";
    case 404:
      return /model/.test(text) ? "model_not_found" : "not_found";
    case 408:
    case 504:
      return "timeout";
    case 429:
      return "rate_limited";
    case 502:
      return "bad_gateway";
    case 503:
    case 529:
      return "unavailable";
    default:
      return status >= 500 ? "provider_error" : "unknown";
  }
}

/** Pulls a human message out of the usual provider error shapes. */
export function extractProviderMessage(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const root = parsed as { error?: unknown; message?: unknown; detail?: unknown };
    if (typeof root.error === "string") return root.error;
    if (typeof root.error === "object" && root.error !== null) {
      const message = (root.error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    if (typeof root.message === "string") return root.message;
    if (typeof root.detail === "string") return root.detail;
  } catch {
    return undefined;
  }
  return undefined;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export function errorFromResponse(status: number, body: string, retryAfter: string | null = null): NexaError {
  const providerMessage = extractProviderMessage(body);
  const details = `HTTP ${status}: ${providerMessage ?? body.slice(0, 500)}`;
  return new NexaError(codeForStatus(status, body), { status, details, retryAfterMs: parseRetryAfter(retryAfter) });
}

export function toNexaError(error: unknown): NexaError {
  if (error instanceof NexaError) return error;
  if (isAbortError(error)) return new NexaError("aborted");
  return new NexaError("unknown", { details: error instanceof Error ? error.message : String(error) });
}
