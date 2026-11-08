"use client";

import { create } from "zustand";
import { toNexaError } from "@/lib/errors";
import type { ConnectionResult } from "@/providers";
import { createAdapter, deleteProvider, healthFromResult } from "@/services/provider-service";
import { getStorage } from "@/storage";
import type { ModelConfig, ProviderConfig } from "@/types";

interface ProviderState {
  providers: ProviderConfig[];
  models: ModelConfig[];
  loaded: boolean;
  load: () => Promise<void>;
  upsertProvider: (provider: ProviderConfig) => void;
  removeProvider: (id: string) => Promise<void>;
  testProvider: (id: string) => Promise<ConnectionResult>;
  upsertModel: (model: ModelConfig) => Promise<void>;
  removeModel: (id: string) => Promise<void>;
  toggleFavoriteModel: (id: string) => Promise<void>;
  /** Remembers a parameter a model rejected, so it is never sent again. */
  markUnsupportedParam: (id: string, param: string) => void;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  models: [],
  loaded: false,

  load: async () => {
    const storage = getStorage();
    const [providers, models] = await Promise.all([storage.getAll("providers"), storage.getAll("models")]);
    providers.sort((a, b) => a.createdAt - b.createdAt);
    models.sort((a, b) => a.createdAt - b.createdAt);
    set({ providers, models, loaded: true });
  },

  upsertProvider: (provider) =>
    set((state) => ({
      providers: state.providers.some((item) => item.id === provider.id)
        ? state.providers.map((item) => (item.id === provider.id ? provider : item))
        : [...state.providers, provider],
    })),

  removeProvider: async (id) => {
    await deleteProvider(id);
    set((state) => ({
      providers: state.providers.filter((provider) => provider.id !== id),
      models: state.models.filter((model) => model.providerId !== id),
    }));
  },

  testProvider: async (id) => {
    const provider = get().providers.find((item) => item.id === id);
    if (!provider) throw new Error("Unknown provider");

    const modelId = get().models.find((model) => model.providerId === id)?.modelId;
    let result: ConnectionResult;
    try {
      const adapter = await createAdapter(provider);
      result = await adapter.validateConnection(modelId);
    } catch (caught) {
      result = { ok: false, latencyMs: 0, error: toNexaError(caught) };
    }

    const updated = { ...provider, ...healthFromResult(result), updatedAt: Date.now() };
    await getStorage().put("providers", updated);
    get().upsertProvider(updated);
    return result;
  },

  upsertModel: async (model) => {
    await getStorage().put("models", model);
    set((state) => ({
      models: state.models.some((item) => item.id === model.id)
        ? state.models.map((item) => (item.id === model.id ? model : item))
        : [...state.models, model],
    }));
  },

  removeModel: async (id) => {
    await getStorage().delete("models", id);
    set((state) => ({ models: state.models.filter((model) => model.id !== id) }));
  },

  toggleFavoriteModel: async (id) => {
    const model = get().models.find((item) => item.id === id);
    if (model) await get().upsertModel({ ...model, favorite: !model.favorite, updatedAt: Date.now() });
  },

  markUnsupportedParam: (id, param) => {
    const model = get().models.find((item) => item.id === id);
    if (model && !model.unsupportedParams.includes(param)) {
      void get().upsertModel({ ...model, unsupportedParams: [...model.unsupportedParams, param], updatedAt: Date.now() });
    }
  },
}));

export function providerOf(providers: readonly ProviderConfig[], model: ModelConfig | undefined): ProviderConfig | undefined {
  return model ? providers.find((provider) => provider.id === model.providerId) : undefined;
}
