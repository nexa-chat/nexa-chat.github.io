import type { GenerationParams, ModelConfig, PresetId } from "@/types";

export interface GenerationPreset {
  id: PresetId;
  label: string;
  description: string;
  params: GenerationParams;
}

export const GENERATION_PRESETS: readonly GenerationPreset[] = [
  { id: "fast", label: "Fast", description: "Quick answers, no extended reasoning", params: { temperature: 0.7, reasoning: false } },
  { id: "balanced", label: "Balanced", description: "The provider's own defaults", params: {} },
  { id: "reasoning", label: "Reasoning", description: "Careful, thinks before answering", params: { temperature: 0.2, reasoning: true, reasoningEffort: "high" } },
  { id: "creative", label: "Creative", description: "More varied writing", params: { temperature: 1, topP: 0.95, reasoning: false } },
  { id: "custom", label: "Custom", description: "Uses this model's saved parameters", params: {} },
];

/**
 * The model's saved parameters plus the preset, minus anything the model can't take.
 * Adapters then send only what remains, under the names their API expects.
 */
export function resolveParams(model: Pick<ModelConfig, "parameters" | "capabilities">, presetId: PresetId): GenerationParams {
  const preset = GENERATION_PRESETS.find((item) => item.id === presetId);
  const merged: GenerationParams = presetId === "custom" ? { ...model.parameters } : { maxTokens: model.parameters.maxTokens, ...preset?.params };

  if (!model.capabilities.supportsReasoning) {
    delete merged.reasoning;
    delete merged.reasoningEffort;
  }
  return merged;
}

/**
 * A rough count for text not yet sent: about four characters per token in English. Real
 * tokenizers differ by model and language, so this is only ever shown as an estimate.
 */
export function estimateTokens(characters: number): number {
  return Math.ceil(characters / 4);
}

export function formatCost(cost: number): string {
  return cost < 0.01 ? `~$${cost.toFixed(4)}` : `~$${cost.toFixed(2)}`;
}

const COMPACT = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function formatTokens(tokens: number): string {
  return COMPACT.format(tokens);
}

export function estimateCost(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  pricing: ModelConfig["pricing"],
): number | undefined {
  if (!usage || !pricing) return undefined;
  const { inputTokens, outputTokens } = usage;
  const { inputPerMTok, outputPerMTok } = pricing;
  if (inputPerMTok === undefined && outputPerMTok === undefined) return undefined;
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return ((inputTokens ?? 0) * (inputPerMTok ?? 0) + (outputTokens ?? 0) * (outputPerMTok ?? 0)) / 1_000_000;
}
