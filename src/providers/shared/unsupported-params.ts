import { extractProviderMessage } from "@/lib/errors";

const KNOWN_PARAMS = [
  "temperature",
  "top_p",
  "top_k",
  "frequency_penalty",
  "presence_penalty",
  "max_tokens",
  "max_completion_tokens",
  "reasoning_effort",
  "reasoning",
  "stream_options",
  "thinking",
  "output_config",
  "tools",
  "thinkingConfig",
  "topP",
  "maxOutputTokens",
] as const;

const REJECTION = /unsupported|not support|deprecated|not permitted|not allowed|unknown|unrecognized|unexpected|extra inputs|cannot both|does not accept/i;

/**
 * Finds the parameter a provider is complaining about, so it can be dropped and the request
 * resent. This replaces a model table that would go stale: the provider is the authority.
 */
export function detectUnsupportedParam(body: string): string | undefined {
  const message = extractProviderMessage(body) ?? body;
  if (!REJECTION.test(message)) return undefined;

  let earliest: { param: string; index: number } | undefined;
  for (const param of KNOWN_PARAMS) {
    const match = new RegExp(`(^|[^A-Za-z_])${param}([^A-Za-z_]|$)`).exec(message);
    if (match && (earliest === undefined || match.index < earliest.index)) {
      earliest = { param, index: match.index };
    }
  }
  return earliest?.param;
}
