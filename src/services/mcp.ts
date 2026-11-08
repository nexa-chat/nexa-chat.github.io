/**
 * A minimal client for MCP servers over Streamable HTTP, straight from the browser. It covers
 * what NEXA needs: initialize, list tools, call a tool. The server must allow this site's origin
 * (CORS) and expose the Mcp-Session-Id header, or the browser blocks the exchange: that is the
 * browser's rule, and NEXA says so rather than hiding it.
 */

import type { ToolDefinition } from "@/types";
import { t } from "@/i18n";

const PROTOCOL_VERSION = "2025-06-18";
const TIMEOUT_MS = 30_000;

export class McpError extends Error {}

export interface McpTarget {
  id: string;
  url: string;
  /** An Authorization header value, from the vault. */
  authorization?: string;
}

interface JsonRpcResponse {
  id?: number | string;
  result?: unknown;
  error?: { message?: string };
}

const sessions = new Map<string, string>();
let nextId = 1;

/** Reads a JSON-RPC response from an SSE stream, stopping at the one that answers our request. */
async function fromEventStream(response: Response, id: number): Promise<JsonRpcResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new McpError("The server sent an empty stream.");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) {
          const message = JSON.parse(data) as JsonRpcResponse;
          if (message.id === id) return message;
        }
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  throw new McpError("The server closed the stream without answering.");
}

async function post(target: McpTarget, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": PROTOCOL_VERSION,
  };
  const session = sessions.get(target.id);
  if (session) headers["mcp-session-id"] = session;
  if (target.authorization) headers.authorization = target.authorization;

  try {
    return await fetch(target.url, { method: "POST", headers, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  } catch (caught) {
    if (caught instanceof DOMException && (caught.name === "AbortError" || caught.name === "TimeoutError")) throw new McpError("The server took too long to answer.");
    throw new McpError(t("Couldn't reach the server. It must allow requests from {0} (CORS), and expose the Mcp-Session-Id header.", { 0: location.origin }));
  }
}

async function request(target: McpTarget, method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const id = nextId++;
  const response = await post(target, { jsonrpc: "2.0", id, method, params }, signal);
  if (response.status === 404 && sessions.has(target.id)) {
    // The session expired on the server: start a new one and try once more.
    sessions.delete(target.id);
    await initialize(target);
    return request(target, method, params, signal);
  }
  if (response.status === 401 || response.status === 403) throw new McpError("The server refused the credentials.");
  if (!response.ok) throw new McpError(t("The server answered with HTTP {0}.", { 0: response.status }));

  const session = response.headers.get("mcp-session-id");
  if (session) sessions.set(target.id, session);

  const message = response.headers.get("content-type")?.includes("text/event-stream") ? await fromEventStream(response, id) : ((await response.json()) as JsonRpcResponse);
  if (message.error) throw new McpError(message.error.message ?? "The server reported an error.");
  return message.result;
}

async function initialize(target: McpTarget): Promise<void> {
  await request(target, "initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "NEXA", version: "1.0" } });
  // A notification has no id and no answer to wait for.
  await post(target, { jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => undefined);
}

async function ensureSession(target: McpTarget): Promise<void> {
  if (!sessions.has(target.id)) await initialize(target);
}

export async function listTools(target: McpTarget): Promise<ToolDefinition[]> {
  await ensureSession(target);
  const result = (await request(target, "tools/list", {})) as { tools?: { name?: unknown; description?: unknown; inputSchema?: unknown }[] } | undefined;
  return (result?.tools ?? []).flatMap((tool) =>
    typeof tool.name === "string"
      ? [{ name: tool.name, description: typeof tool.description === "string" ? tool.description : "", inputSchema: (tool.inputSchema as Record<string, unknown> | undefined) ?? { type: "object", properties: {} } }]
      : [],
  );
}

/** Runs a tool and flattens its content to text, which is what every provider accepts back. */
export async function callTool(target: McpTarget, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<{ text: string; isError: boolean }> {
  await ensureSession(target);
  const result = (await request(target, "tools/call", { name, arguments: args }, signal)) as { content?: { type?: string; text?: string }[]; isError?: boolean } | undefined;
  const text = (result?.content ?? [])
    .map((part) => (part.type === "text" ? (part.text ?? "") : `[${part.type ?? "content"} not shown]`))
    .join("\n")
    .trim();
  return { text: text || "(The tool returned nothing.)", isError: Boolean(result?.isError) };
}

export function forgetSession(serverId: string): void {
  sessions.delete(serverId);
}
