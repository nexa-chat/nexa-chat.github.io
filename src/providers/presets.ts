import type { ApiType } from "@/types";

export interface ProviderPreset {
  id: string;
  name: string;
  apiType: ApiType;
  baseUrl: string;
  requiresKey: boolean;
  keyUrl?: string;
  keyPlaceholder?: string;
  note?: string;
}

/** Starting points only. No model list is hardcoded: models come from the provider. */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  { id: "openai", name: "OpenAI", apiType: "openai", baseUrl: "https://api.openai.com/v1", requiresKey: true, keyUrl: "https://platform.openai.com/api-keys", keyPlaceholder: "sk-..." },
  { id: "anthropic", name: "Anthropic", apiType: "anthropic", baseUrl: "https://api.anthropic.com/v1", requiresKey: true, keyUrl: "https://console.anthropic.com/settings/keys", keyPlaceholder: "sk-ant-..." },
  { id: "gemini", name: "Google Gemini", apiType: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", requiresKey: true, keyUrl: "https://aistudio.google.com/apikey", keyPlaceholder: "AIza..." },
  { id: "openrouter", name: "OpenRouter", apiType: "openrouter", baseUrl: "https://openrouter.ai/api/v1", requiresKey: true, keyUrl: "https://openrouter.ai/keys", keyPlaceholder: "sk-or-..." },
  { id: "deepseek", name: "DeepSeek", apiType: "openai", baseUrl: "https://api.deepseek.com/v1", requiresKey: true, keyUrl: "https://platform.deepseek.com/api_keys", keyPlaceholder: "sk-..." },
  { id: "mistral", name: "Mistral", apiType: "openai", baseUrl: "https://api.mistral.ai/v1", requiresKey: true, keyUrl: "https://console.mistral.ai/api-keys" },
  { id: "xai", name: "xAI", apiType: "openai", baseUrl: "https://api.x.ai/v1", requiresKey: true, keyUrl: "https://console.x.ai", keyPlaceholder: "xai-..." },
  { id: "groq", name: "Groq", apiType: "openai", baseUrl: "https://api.groq.com/openai/v1", requiresKey: true, keyUrl: "https://console.groq.com/keys", keyPlaceholder: "gsk_..." },
  {
    id: "ollama",
    name: "Ollama",
    apiType: "openai",
    baseUrl: "http://localhost:11434/v1",
    requiresKey: false,
    note: "Runs on your machine. Start Ollama with OLLAMA_ORIGINS set to this site's address so the browser may reach it.",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    apiType: "openai",
    baseUrl: "http://localhost:1234/v1",
    requiresKey: false,
    note: "Runs on your machine. Turn on the local server and enable CORS in LM Studio.",
  },
];

export const API_TYPE_LABELS: Record<ApiType, string> = {
  openai: "OpenAI Compatible",
  anthropic: "Anthropic Compatible",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  "custom-http": "Custom HTTP",
};

export function findPreset(id: string | undefined): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}
