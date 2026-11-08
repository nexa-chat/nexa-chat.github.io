import { NexaError, isAbortError, toNexaError } from "@/lib/errors";
import { withRetry } from "@/lib/retry";
import { collectToolCalls } from "@/providers/shared/base-adapter";
import type { ChatRequest, FinishReason, ProviderAdapter } from "@/providers";
import type { ToolCall, Usage } from "@/types";
import { ThinkFilter, type FilteredDelta } from "./think-filter";

export interface GenerationCallbacks {
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onRetrying?: (info: { attempt: number; delayMs: number; error: NexaError }) => void;
  onParamDropped?: (param: string) => void;
}

export interface GenerationOutcome {
  usage?: Usage;
  finishReason?: FinishReason;
  toolCalls: ToolCall[];
  /** Set when the run failed. Text received before the failure stays with the caller. */
  error?: NexaError;
  stopped: boolean;
}

export interface GenerationOptions {
  adapter: ProviderAdapter;
  request: ChatRequest;
  autoRetry: boolean;
  callbacks: GenerationCallbacks;
}

const AUTO_RETRIES = 2;

function mergeUsage(current: Usage | undefined, next: Usage): Usage {
  return {
    inputTokens: next.inputTokens ?? current?.inputTokens,
    outputTokens: next.outputTokens ?? current?.outputTokens,
    totalTokens: next.totalTokens ?? current?.totalTokens,
  };
}

/**
 * Drives one streamed response. Automatic retries only happen before the first token: once
 * text has been shown, resending would bill the user twice and duplicate the output.
 */
export async function runGeneration({ adapter, request, autoRetry, callbacks }: GenerationOptions): Promise<GenerationOutcome> {
  const outcome: GenerationOutcome = { toolCalls: [], stopped: false };
  const toolCalls = new Map<number, ToolCall>();
  let started = false;

  const emit = ({ text, reasoning }: FilteredDelta): void => {
    if (reasoning) callbacks.onReasoning?.(reasoning);
    if (text) callbacks.onText?.(text);
  };

  const attempt = async (): Promise<void> => {
    const thinkFilter = new ThinkFilter();
    try {
      for await (const event of adapter.streamMessage(request)) {
        switch (event.type) {
          case "text":
            started = true;
            emit(thinkFilter.push(event.delta));
            break;
          case "reasoning":
            started = true;
            callbacks.onReasoning?.(event.delta);
            break;
          case "tool_call":
            started = true;
            collectToolCalls(toolCalls, event);
            break;
          case "usage":
            outcome.usage = mergeUsage(outcome.usage, event.usage);
            break;
          case "finish":
            outcome.finishReason = event.reason;
            break;
          case "param_dropped":
            callbacks.onParamDropped?.(event.param);
            break;
        }
      }
      emit(thinkFilter.flush());
    } catch (caught) {
      emit(thinkFilter.flush());
      if (isAbortError(caught) || request.signal?.aborted) throw new NexaError("aborted");
      const error = adapter.normalizeError(caught);
      if (started) {
        outcome.error = error;
        return;
      }
      throw error;
    }
  };

  try {
    await withRetry(attempt, {
      maxRetries: autoRetry ? AUTO_RETRIES : 0,
      signal: request.signal,
      onRetry: callbacks.onRetrying,
    });
  } catch (caught) {
    const error = toNexaError(caught);
    if (error.code === "aborted") outcome.stopped = true;
    else outcome.error = error;
  }

  outcome.toolCalls = [...toolCalls.values()];
  return outcome;
}
