import { NexaError } from "@/lib/errors";
import type { ApiType } from "@/types";
import type { AdapterContext, ProviderAdapter, ProviderDefinition } from "./types";

/** Adding a provider means registering one definition. Nothing else in the app changes. */
export class ProviderRegistry {
  private readonly definitions = new Map<ApiType, ProviderDefinition>();

  register(definition: ProviderDefinition): void {
    this.definitions.set(definition.apiType, definition);
  }

  get(apiType: ApiType): ProviderDefinition | undefined {
    return this.definitions.get(apiType);
  }

  list(): ProviderDefinition[] {
    return [...this.definitions.values()];
  }

  create(context: AdapterContext): ProviderAdapter {
    const definition = this.definitions.get(context.config.apiType);
    if (!definition) throw new NexaError("config", { details: `No adapter for ${context.config.apiType}` });
    const adapter = definition.create(context);
    adapter.initialize();
    return adapter;
  }
}
