/** Narrowing helpers for untrusted provider JSON. Avoids `any` at the parsing boundary. */
export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Parses one streamed JSON payload. A bad chunk returns undefined instead of ending the stream. */
export function parseChunk(data: string): JsonObject | undefined {
  try {
    return asObject(JSON.parse(data));
  } catch {
    return undefined;
  }
}

export function getPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split(".")) {
    if (Array.isArray(current)) current = current[Number(key)];
    else {
      const object = asObject(current);
      if (!object) return undefined;
      current = object[key];
    }
  }
  return current;
}
