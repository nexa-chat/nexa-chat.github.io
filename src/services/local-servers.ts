/**
 * Looks for model servers running on this computer. It only runs when the user asks, because
 * browsers may ask permission before a website talks to the local network.
 */

export type LocalStatus = "ready" | "blocked" | "absent";

export interface LocalServer {
  presetId: "ollama" | "lmstudio";
  name: string;
  status: LocalStatus;
  models: string[];
}

const SERVERS = [
  { presetId: "ollama", name: "Ollama", url: "http://localhost:11434/v1/models" },
  { presetId: "lmstudio", name: "LM Studio", url: "http://localhost:1234/v1/models" },
] as const;

const PROBE_TIMEOUT_MS = 1500;

function modelIds(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !("data" in body) || !Array.isArray(body.data)) return [];
  return body.data.flatMap((item: unknown) => (typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" ? [item.id] : []));
}

/**
 * A normal request that fails can mean "nothing there" or "there, but refusing this site". An
 * opaque request tells them apart: it succeeds whenever something answers, CORS or not.
 */
async function probe(url: string): Promise<{ status: LocalStatus; models: string[] }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return { status: "blocked", models: [] };
    return { status: "ready", models: modelIds(await response.json()) };
  } catch {
    try {
      await fetch(url, { mode: "no-cors", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), cache: "no-store" });
      return { status: "blocked", models: [] };
    } catch {
      return { status: "absent", models: [] };
    }
  }
}

export async function detectLocalServers(): Promise<LocalServer[]> {
  return Promise.all(SERVERS.map(async (server) => ({ presetId: server.presetId, name: server.name, ...(await probe(server.url)) })));
}
