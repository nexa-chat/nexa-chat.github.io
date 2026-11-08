import { NexaError, isAbortError, toNexaError } from "./errors";

export interface RetryOptions {
  /** Automatic retries after the first attempt. */
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** A server asking for a longer wait than this is left for the user to retry. */
  maxRetryAfterMs?: number;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; delayMs: number; error: NexaError }) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new NexaError("aborted"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new NexaError("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Retries transient failures with exponential backoff and jitter. Honours Retry-After. */
export async function withRetry<T>(run: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxRetries,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    maxRetryAfterMs = 20_000,
    signal,
    onRetry,
    sleep: wait = sleep,
    random = Math.random,
  } = options;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run(attempt);
    } catch (caught) {
      if (isAbortError(caught)) throw new NexaError("aborted");
      const error = toNexaError(caught);
      const tooLong = error.retryAfterMs !== undefined && error.retryAfterMs > maxRetryAfterMs;
      if (!error.retryable || attempt >= maxRetries || tooLong) throw error;

      const delayMs = error.retryAfterMs ?? backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
      onRetry?.({ attempt: attempt + 1, delayMs, error });
      await wait(delayMs, signal);
    }
  }
}
