// A tiny MCP server over Streamable HTTP, for trying NEXA's tools without a real one.
// Development only.
//
//   npm run mock:mcp
//   In NEXA: Settings, Tools, add a server with the URL http://localhost:4020/mcp
//
// It offers two tools: word_count and echo. It answers in plain JSON, sends CORS headers
// and exposes Mcp-Session-Id, which is what a real server needs to do for the browser.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4020);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-expose-headers": "mcp-session-id",
};

const TOOLS = [
  {
    name: "word_count",
    description: "Counts the words and characters in a text.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "echo",
    description: "Returns the message it is given.",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  },
];

function run(name, args) {
  if (name === "word_count") {
    const text = String(args.text ?? "");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { content: [{ type: "text", text: `${words} words, ${text.length} characters.` }] };
  }
  if (name === "echo") return { content: [{ type: "text", text: String(args.message ?? "") }] };
  return { content: [{ type: "text", text: `Unknown tool ${name}` }], isError: true };
}

const sessions = new Set();

function send(res, status, body, extra = {}) {
  res.writeHead(status, { "content-type": "application/json", ...CORS, ...extra });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method !== "POST" || !req.url?.startsWith("/mcp")) {
    send(res, 404, { error: "Not found" });
    return;
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      send(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } });
      return;
    }

    if (message.method === "initialize") {
      const id = randomUUID();
      sessions.add(id);
      send(res, 200, { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "nexa-mock-mcp", version: "1.0" } } }, { "mcp-session-id": id });
      return;
    }

    const session = req.headers["mcp-session-id"];
    if (!session || !sessions.has(String(session))) {
      send(res, 404, { jsonrpc: "2.0", id: message.id ?? null, error: { code: -32001, message: "Session not found" } });
      return;
    }
    if (message.id === undefined) {
      res.writeHead(202, CORS);
      res.end();
      return;
    }
    if (message.method === "tools/list") send(res, 200, { jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } });
    else if (message.method === "tools/call") send(res, 200, { jsonrpc: "2.0", id: message.id, result: run(message.params?.name, message.params?.arguments ?? {}) });
    else send(res, 200, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
  });
});

server.listen(PORT, () => console.warn(`Mock MCP server on http://localhost:${PORT}/mcp`));
