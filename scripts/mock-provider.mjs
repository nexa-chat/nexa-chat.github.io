// A local OpenAI-compatible and Anthropic-compatible server for trying NEXA without a real
// key. It answers with canned text and can simulate failures. Development only.
//
//   npm run mock:provider
//   Base URL: http://localhost:4010/v1      API key: mock-key      Model: mock-gpt
//
// Model IDs change the behaviour: mock-401, mock-429, mock-500, mock-slow, mock-cut.
// mock-preview answers with HTML and a diagram, mock-echo repeats the system prompt it got.
// mock-gpt-tools calls a tool when it is offered one, then answers with the result.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
const KEY = "mock-key";

const REPLY = `Here is a streamed response from the **mock provider**.

## What this shows

- Markdown lists and *emphasis*
- A table, a code block and maths

| Feature | Status |
| --- | --- |
| Streaming | Working |
| Tables | Working |

\`\`\`typescript
const response = await api.chat({ model: "mock-gpt", stream: true });
for await (const chunk of response) process.stdout.write(chunk);
\`\`\`

The mass-energy relation is $E = mc^2$, and that's the end of this answer.`;

const PREVIEW_REPLY = `Here is a small page and a diagram.

\`\`\`html
<!doctype html>
<html>
  <body style="font-family: system-ui; padding: 24px">
    <h1 id="title">Hello from a preview</h1>
    <button onclick="document.getElementById('title').textContent = 'Scripts run, isolated'">Click me</button>
  </body>
</html>
\`\`\`

\`\`\`mermaid
flowchart LR
  Browser --> Provider
\`\`\`
`;

function replyFor(model, body) {
  if (model === "mock-preview") return PREVIEW_REPLY;
  if (model === "mock-echo") {
    const system = body.system ?? body.messages?.find((message) => message.role === "system")?.content ?? "(no system prompt)";
    return `System prompt received:\n\n${typeof system === "string" ? system : JSON.stringify(system)}`;
  }
  return REPLY;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

function tokens(text) {
  return text.match(/\s*\S+|\s+$/g) ?? [];
}

async function streamOpenAI(req, res, model, body) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", ...CORS });
  const pieces = tokens(replyFor(model, body));
  const delay = model === "mock-slow" ? 120 : 18;
  let closed = false;
  res.on("close", () => (closed = true));

  for (const [index, content] of pieces.entries()) {
    if (closed) return;
    if (model === "mock-cut" && index === 20) {
      res.destroy();
      return;
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
    await sleep(delay);
  }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 42, completion_tokens: pieces.length, total_tokens: 42 + pieces.length } })}\n\n`);
  res.end("data: [DONE]\n\n");
}

/** Picks a tool and arguments from what NEXA offered, preferring the calculator. */
function toolCallFor(tools) {
  const names = tools.map((tool) => tool.function?.name ?? "");
  const pick = names.find((name) => name.includes("calculator")) ?? names.find((name) => name.includes("word_count")) ?? names[0];
  const args = pick.includes("calculator") ? { expression: "(12.5 * 4) ^ 2 / sqrt(16)" } : pick.includes("word_count") ? { text: "hello brave new world" } : pick.includes("echo") ? { message: "ping" } : {};
  return { name: pick, args: JSON.stringify(args) };
}

async function streamToolTurn(res, body) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", ...CORS });
  const last = body.messages?.at(-1);
  if (last?.role === "tool") {
    for (const content of tokens(`The tool answered: ${last.content}`)) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      await sleep(18);
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
    return;
  }
  const call = toolCallFor(body.tools ?? []);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_" + Date.now(), type: "function", function: { name: call.name, arguments: "" } }] } }] })}\n\n`);
  for (const piece of call.args.match(/.{1,6}/g) ?? []) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: piece } }] } }] })}\n\n`);
    await sleep(15);
  }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`);
  res.end("data: [DONE]\n\n");
}

async function streamAnthropic(res, body) {
  res.writeHead(200, { "content-type": "text/event-stream", ...CORS });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send("message_start", { message: { usage: { input_tokens: 42 } } });
  send("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  const pieces = tokens(replyFor(body.model, body));
  for (const text of pieces) {
    send("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
    await sleep(18);
  }
  send("content_block_stop", { index: 0 });
  send("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: pieces.length } });
  send("message_stop", {});
  res.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const authorized = req.headers.authorization === `Bearer ${KEY}` || req.headers["x-api-key"] === KEY;
  if (!authorized) {
    json(res, 401, { error: { message: "Invalid API key" } });
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/v1/models")) {
    json(res, 200, { data: [{ id: "mock-gpt" }, { id: "mock-slow" }, { id: "mock-cut" }, { id: "mock-preview" }, { id: "mock-echo" }, { id: "mock-gpt-tools" }, { id: "mock-401" }, { id: "mock-429" }, { id: "mock-500" }] });
    return;
  }

  const body = await readBody(req);

  if (body.model === "mock-401") json(res, 401, { error: { message: "Invalid API key" } });
  else if (body.model === "mock-429") json(res, 429, { error: { message: "Rate limit reached" } });
  else if (body.model === "mock-500") json(res, 500, { error: { message: "Internal error" } });
  else if (req.url === "/v1/chat/completions") {
    const system = body.messages?.find((message) => message.role === "system")?.content ?? "";
    const quick = typeof system === "string" && system.startsWith("Summarize this conversation") ? "- The user asked the mock provider for help.\n- It answered with Markdown, a table and code." : "Mock title";
    if (body.stream && body.model === "mock-gpt-tools" && body.tools?.length) await streamToolTurn(res, body);
    else if (body.stream) await streamOpenAI(req, res, body.model, body);
    else json(res, 200, { choices: [{ message: { content: quick }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } });
  } else if (req.url === "/v1/messages") {
    if (body.stream) await streamAnthropic(res, body);
    else json(res, 200, { content: [{ type: "text", text: "Mock title" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 2 } });
  } else json(res, 404, { error: { message: "Not found" } });
});

server.listen(PORT, () => console.warn(`Mock provider on http://localhost:${PORT}/v1 (key: ${KEY})`));
