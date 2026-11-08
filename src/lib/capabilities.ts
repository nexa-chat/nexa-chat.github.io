import type { ApiType, ModelCapabilities } from "@/types";

const VISION = /gpt-4o|gpt-4\.1|gpt-5|\bo[134]\b|claude|gemini|gemma-3|pixtral|vision|[-_/]vl\b|-vl-|llava|grok-[234]/i;
const TOOLS = /gpt|\bo[134]\b|claude|gemini|mistral|mixtral|grok|deepseek|qwen|llama-?3|command/i;
const REASONING = /\bo[134]\b|gpt-5|claude-(opus|sonnet|haiku|fable)-[45]|reason|thinking|\br1\b|gemini-(2\.5|3)|grok-[34]|qwq/i;
const NATIVE_FILES = /claude|gemini/i;

/**
 * A first guess for a model the provider gives no metadata about. The user can correct every
 * value in the model's settings, and the interface follows what is saved there.
 */
export function inferCapabilities(apiType: ApiType, modelId: string): ModelCapabilities {
  if (apiType === "custom-http") {
    return { supportsVision: false, supportsImages: false, supportsTools: false, supportsReasoning: false, supportsFiles: false, supportsStreaming: true };
  }
  const vision = VISION.test(modelId);
  return {
    supportsVision: vision,
    supportsImages: vision,
    supportsTools: TOOLS.test(modelId),
    supportsReasoning: REASONING.test(modelId),
    supportsStreaming: true,
    supportsFiles: (apiType === "anthropic" || apiType === "gemini") && NATIVE_FILES.test(modelId),
  };
}

export function capabilityLabels(capabilities: ModelCapabilities): string[] {
  const labels: string[] = [];
  if (capabilities.supportsVision) labels.push("Vision");
  if (capabilities.supportsTools) labels.push("Tools");
  if (capabilities.supportsReasoning) labels.push("Reasoning");
  if (capabilities.supportsFiles) labels.push("Files");
  return labels;
}

/** Turns an ID like "anthropic/claude-opus-4-7" into "Claude Opus 4.7". */
export function prettifyModelName(modelId: string): string {
  const base = modelId.split("/").pop() ?? modelId;
  const withoutDate = base.replace(/[-_]\d{8}$/, "").replace(/[-_]\d{4}-\d{2}-\d{2}$/, "");
  const dotted = withoutDate.replace(/(\d)-(\d)(?!\d)/g, "$1.$2");
  return dotted
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => (/^(gpt|ai|xl|vl)$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}
