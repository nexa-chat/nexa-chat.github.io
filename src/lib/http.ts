import type { ConnectionMode } from "@/types";
import { NexaError, errorFromResponse } from "./errors";
import { assertUrl, isMixedContent } from "./url";
import { withBase } from "./base-path";

export interface HttpRequest {
  url: string;
  method: "GET" | "POST" | "PUT";
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** Time allowed until response headers arrive. */
  timeoutMs?: number;
}

export type FetchImpl = typeof fetch;

export interface HttpClientOptions {
  connection: ConnectionMode;
  fetchImpl?: FetchImpl;
  relayPath?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
/** A static build has no server, so no relay: requests to it fail and the app says so. */
export const RELAY_PATH = withBase("/api/relay");

/**
 * All provider traffic goes through here. Keys travel in headers, credentials and referrers
 * are never attached, and failed fetches are diagnosed instead of reported as "failed".
 */
export class HttpClient {
  private readonly connection: ConnectionMode;
  private readonly fetchImpl: FetchImpl;
  private readonly relayPath: string;

  constructor(options: HttpClientOptions) {
    this.connection = options.connection;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.relayPath = options.relayPath ?? RELAY_PATH;
  }

  async send(request: HttpRequest): Promise<Response> {
    assertUrl(request.url);
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);

    const signal = request.signal ? anySignal(request.signal, timeoutController.signal) : timeoutController.signal;

    try {
      return await (this.connection === "relay" ? this.viaRelay(request, signal) : this.direct(request, signal));
    } catch (caught) {
      if (request.signal?.aborted) throw new NexaError("aborted");
      if (timedOut) throw new NexaError("timeout", { details: `No response after ${Math.round(timeoutMs / 1000)}s` });
      if (caught instanceof NexaError) throw caught;
      throw await this.diagnose(request.url);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Sends the request and turns any non-2xx status into a NexaError. */
  async sendOk(request: HttpRequest): Promise<Response> {
    const response = await this.send(request);
    if (response.ok) return response;
    throw errorFromResponse(response.status, await safeText(response), response.headers.get("retry-after"));
  }

  private direct(request: HttpRequest, signal: AbortSignal): Promise<Response> {
    return this.fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
  }

  private async viaRelay(request: HttpRequest, signal: AbortSignal): Promise<Response> {
    const response = await this.fetchImpl(this.relayPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body,
      }),
      signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (response.headers.get("x-nexa-relay-error")) {
      const reason = await safeText(response);
      throw new NexaError(response.status === 404 ? "relay_unavailable" : "network", { details: reason });
    }
    if (response.status === 404 && !response.headers.get("x-nexa-relay")) {
      throw new NexaError("relay_unavailable");
    }
    return response;
  }

  /**
   * fetch() reports CORS and connection failures with the same TypeError. A credential-free
   * no-cors probe separates them: an opaque answer proves the server is reachable, which
   * means the browser blocked the real request.
   */
  private async diagnose(url: string): Promise<NexaError> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return new NexaError("offline");
    if (typeof location !== "undefined" && isMixedContent(url, location.protocol)) return new NexaError("mixed_content");
    if (this.connection === "relay") return new NexaError("network");

    const host = new URL(url).host;
    try {
      await this.fetchImpl(url, {
        method: "GET",
        mode: "no-cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      return new NexaError("cors", { details: `${host} answered, but sent no CORS permission for this site.` });
    } catch {
      return new NexaError("network", { details: `No response from ${host}.` });
    }
  }
}

/** AbortSignal.any only reached Safari in 17.4, and older iPhones are still in use. */
function anySignal(...signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export interface ReadTextOptions {
  signal?: AbortSignal;
  /**
   * Fails the stream if no bytes arrive for this long. It has to be generous: a reasoning
   * model can think for minutes before it writes anything.
   */
  idleTimeoutMs?: number;
}

/** Yields decoded text from a response body with an idle watchdog. */
export async function* readText(response: Response, options: ReadTextOptions = {}): AsyncGenerator<string> {
  if (!response.body) throw new NexaError("malformed_response", { details: "The response has no body." });
  const { signal, idleTimeoutMs = 300_000 } = options;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    for (;;) {
      if (signal?.aborted) throw new NexaError("aborted");
      const { done, value } = await readWithTimeout(reader, idleTimeoutMs, signal);
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number,
  signal?: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NexaError("stream_interrupted", { details: "The stream went silent." })), idleTimeoutMs);
    onAbort = () => reject(new NexaError("aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([reader.read(), watchdog]);
  } catch (caught) {
    if (caught instanceof NexaError) throw caught;
    if (signal?.aborted) throw new NexaError("aborted");
    throw new NexaError("stream_interrupted", { details: caught instanceof Error ? caught.message : undefined });
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}
