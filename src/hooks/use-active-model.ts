"use client";

import { useMemo } from "react";
import { useChatStore } from "@/features/chat/chat-store";
import { useProviderStore } from "@/features/providers/provider-store";
import { useSettingsStore } from "@/features/settings/settings-store";
import type { Conversation, ModelConfig, ProviderConfig } from "@/types";

export interface ActiveContext {
  conversation?: Conversation;
  model?: ModelConfig;
  provider?: ProviderConfig;
}

/** The conversation on screen and the model the next message will use. */
export function useActiveContext(): ActiveContext {
  const activeId = useChatStore((state) => state.activeId);
  const conversations = useChatStore((state) => state.conversations);
  const draftModelId = useChatStore((state) => state.draftModelId);
  const models = useProviderStore((state) => state.models);
  const providers = useProviderStore((state) => state.providers);
  const defaultModelId = useSettingsStore((state) => state.settings.defaultModelId);

  return useMemo(() => {
    const conversation = conversations.find((item) => item.id === activeId);
    const wanted = conversation ? conversation.modelConfigId : draftModelId;
    const model =
      models.find((item) => item.id === wanted) ??
      models.find((item) => item.id === defaultModelId) ??
      models.find((item) => item.favorite) ??
      models[0];
    return { conversation, model, provider: providers.find((item) => item.id === model?.providerId) };
  }, [activeId, conversations, draftModelId, models, providers, defaultModelId]);
}
