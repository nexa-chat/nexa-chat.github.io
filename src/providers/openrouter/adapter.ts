import type { ApiType } from "@/types";
import { asArray, asObject, asString, type JsonObject } from "../shared/json";
import { OpenAIAdapter } from "../openai/adapter";
import type { ChatRequest, RemoteModel } from "../types";

function perMillion(value: unknown): number | undefined {
  const price = Number(asString(value));
  return Number.isFinite(price) && price > 0 ? Number((price * 1_000_000).toFixed(4)) : undefined;
}

/** OpenAI-compatible, plus attribution headers, its reasoning field and a richer model list. */
export class OpenRouterAdapter extends OpenAIAdapter {
  override readonly apiType: ApiType = "openrouter";

  protected override extraHeaders(): Record<string, string> {
    const referer = typeof location === "undefined" ? undefined : location.origin;
    return { "x-title": "NEXA", ...(referer ? { "http-referer": referer } : {}) };
  }

  protected override reasoningBody(request: ChatRequest): JsonObject {
    return { reasoning: { effort: request.params.reasoningEffort ?? "medium" } };
  }

  protected override parseModels(json: unknown): RemoteModel[] {
    return asArray(asObject(json)?.data).flatMap((value) => {
      const model = asObject(value);
      const id = asString(model?.id);
      if (!id) return [];

      const modalities = asArray(asObject(model?.architecture)?.input_modalities);
      const parameters = asArray(model?.supported_parameters);
      const pricing = asObject(model?.pricing);
      const vision = modalities.includes("image");

      return [
        {
          id,
          name: asString(model?.name),
          capabilities: {
            supportsVision: vision,
            supportsImages: vision,
            supportsFiles: modalities.includes("file"),
            supportsTools: parameters.includes("tools"),
            supportsReasoning: parameters.includes("reasoning"),
            supportsStreaming: true,
          },
          pricing: { inputPerMTok: perMillion(pricing?.prompt), outputPerMTok: perMillion(pricing?.completion) },
        },
      ];
    });
  }
}
