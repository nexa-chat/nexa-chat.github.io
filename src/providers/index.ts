import { AnthropicAdapter } from "./anthropic/adapter";
import { CustomHttpAdapter } from "./custom/adapter";
import { GeminiAdapter } from "./gemini/adapter";
import { OpenAIAdapter } from "./openai/adapter";
import { OpenRouterAdapter } from "./openrouter/adapter";
import { ProviderRegistry } from "./registry";

export const providerRegistry = new ProviderRegistry();

providerRegistry.register({ apiType: "openai", label: "OpenAI Compatible", create: (context) => new OpenAIAdapter(context) });
providerRegistry.register({ apiType: "anthropic", label: "Anthropic Compatible", create: (context) => new AnthropicAdapter(context) });
providerRegistry.register({ apiType: "gemini", label: "Google Gemini", create: (context) => new GeminiAdapter(context) });
providerRegistry.register({ apiType: "openrouter", label: "OpenRouter", create: (context) => new OpenRouterAdapter(context) });
providerRegistry.register({ apiType: "custom-http", label: "Custom HTTP", create: (context) => new CustomHttpAdapter(context) });

export type * from "./types";
