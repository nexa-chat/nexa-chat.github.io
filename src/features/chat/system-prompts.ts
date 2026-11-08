import type { Conversation, Settings, SystemPresetId } from "@/types";

export const SYSTEM_PRESETS: readonly { id: SystemPresetId; label: string; prompt: string }[] = [
  { id: "default", label: "Default", prompt: "" },
  {
    id: "coding",
    label: "Coding",
    prompt: "You are a senior software engineer. Give correct, idiomatic code with short explanations. Point out edge cases and trade-offs when they matter.",
  },
  {
    id: "writing",
    label: "Writing",
    prompt: "You are an experienced editor. Write clearly and concretely, match the requested tone, and avoid filler.",
  },
  {
    id: "research",
    label: "Research",
    prompt: "You are a careful researcher. Separate what is well established from what is uncertain, and say plainly when you don't know.",
  },
  { id: "custom", label: "Custom", prompt: "" },
];

export function resolveSystemPrompt(conversation: Pick<Conversation, "systemPreset" | "systemPrompt">, settings: Pick<Settings, "defaultSystemPrompt">): string | undefined {
  if (conversation.systemPreset === "custom") return conversation.systemPrompt.trim() || undefined;
  if (conversation.systemPreset === "default") return settings.defaultSystemPrompt.trim() || undefined;
  return SYSTEM_PRESETS.find((preset) => preset.id === conversation.systemPreset)?.prompt;
}
