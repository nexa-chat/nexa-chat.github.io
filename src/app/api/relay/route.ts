import { lookup } from "node:dns/promises";
import { isBlockedTarget, isPrivateAddress, relayAllowedOrigin } from "@/lib/relay-policy";

const MAX_BODY_BYTES = 40 * 1024 * 1024;
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "cache-control"];
/** Headers the client must not be able to set on the outgoing request. */
const STRIPPED_REQUEST_HEADERS = new Set(["host", "cookie", "connection", "content-length", "transfer-encoding", "origin", "referer"]);

interface RelayEnvelope {
  url: string;
  method: "GET" | "POST" | "PUT";
  headers: Record<string, string>;
  body?: string;
}

function relayEnabled(): boolean {
  return process.env.NEXA_RELAY_ENABLED !== "false";
}

function refuse(status: number, reason: string): Response {
  return new Response(reason, { status, headers: { "x-nexa-relay": "1", "x-nexa-relay-error": "1", "content-type": "text/plain" } });
}

function parseEnvelope(value: unknown): RelayEnvelope | null {
  if (typeof value !== "object" || value === null) return null;
  const { url, method, headers, body } = value as Partial<RelayEnvelope>;
  if (typeof url !== "string" || (method !== "GET" && method !== "POST" && method !== "PUT")) return null;
  if (typeof headers !== "object" || headers === null) return null;
  if (body !== undefined && typeof body !== "string") return null;
  return { url, method, headers, body };
}

/** A public hostname can still point at an internal address. Check where it really goes. */
async function resolvesToPrivateNetwork(url: string): Promise<boolean> {
  try {
    const addresses = await lookup(new URL(url).hostname, { all: true });
    return addresses.some(({ address }) => isPrivateAddress(address));
  } catch {
    return true;
  }
}

/** Tells the client whether this deployment offers a relay at all. */
export function GET(): Response {
  return Response.json({ enabled: relayEnabled() }, { headers: { "x-nexa-relay": "1", "cache-control": "no-store" } });
}

/**
 * Optional pass-through for providers that refuse browser requests. It only runs when a user
 * has turned it on for that provider. It stores nothing and logs nothing: there is
 * deliberately no logging in this file, and errors never echo the request.
 */
export async function POST(request: Request): Promise<Response> {
  if (!relayEnabled()) return refuse(404, "This deployment has no relay.");

  const allowed = relayAllowedOrigin(request.headers.get("origin"), new URL(request.url).origin, process.env.NEXA_RELAY_ALLOWED_ORIGINS);
  if (!allowed) return refuse(403, "This origin may not use the relay.");

  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BODY_BYTES) return refuse(413, "This request is too large for the relay.");

  let envelope: RelayEnvelope | null;
  try {
    envelope = parseEnvelope(await request.json());
  } catch {
    envelope = null;
  }
  if (!envelope) return refuse(400, "Malformed relay request.");

  const blocked = isBlockedTarget(envelope.url);
  if (blocked) return refuse(400, blocked);
  if (await resolvesToPrivateNetwork(envelope.url)) return refuse(400, "The relay can't reach private network addresses.");

  const headers = new Headers();
  for (const [name, value] of Object.entries(envelope.headers)) {
    if (!STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(envelope.url, {
      method: envelope.method,
      headers,
      body: envelope.body,
      redirect: "error",
      signal: request.signal,
    });
  } catch {
    return refuse(502, "The relay couldn't reach this provider.");
  }

  const responseHeaders = new Headers({ "x-nexa-relay": "1", "cache-control": "no-store" });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value && name !== "cache-control") responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
