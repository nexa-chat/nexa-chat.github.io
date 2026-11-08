# NEXA

**Your AI. Your API. Your control.**

NEXA is a universal AI chat client built around your own API keys. Open the URL, add a provider, and chat. There is no NEXA account, and your conversations stay in your browser.

The core of the product is one idea: **API key + base URL + model = chat**.

## What it does

- Works with OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Mistral, xAI, Groq, and any OpenAI-compatible or Anthropic-compatible endpoint, including private gateways and local models.
- Connects to arbitrary HTTP APIs through a configurable body template, response path and stream format.
- Streams responses, with stop, retry, regenerate, continue and edit. Nothing is overwritten: every retry or edit becomes a version you can flip back to, or compare side by side.
- Asks the same question to another model, and shows both answers next to each other.
- Estimates the size and cost of a message before you send it, and totals your usage per month and per model.
- Finds Ollama and LM Studio running on your computer, and adds a provider's models in bulk.
- Projects: a folder with its own instructions and files, which every chat inside it starts from.
- Tools: a calculator and the current time, run in the browser, and tools from MCP servers you add, each run only after you allow it.
- A preview panel that runs generated HTML, SVG and Mermaid diagrams, isolated from your keys and chats.
- A fallback model that answers when your chosen one is down, and long chats that continue from a summary.
- Pinned messages, saved answers, read aloud, answers shared as images, `/` commands with `{{variables}}`, and search filters.
- English and French interfaces.
- Stores everything locally in IndexedDB, with keys encrypted at rest.
- Sends requests straight from the browser to the provider. A relay exists for providers that block browsers, and it stays off until you enable it for a provider.
- Renders Markdown, code, tables and LaTeX, and stays smooth at hundreds of messages.
- Reads images, PDF, TXT, MD, JSON, CSV and DOCX, all processed in the browser.
- Works as an installable PWA, with phone-first details: bottom sheets, a drawer that follows the finger, and a composer that stays above the keyboard.
- Comes in dark and light themes and five palettes: gold, emerald, violet, coral and mono.

## Quick start

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev
```

Open http://localhost:3000. End users don't need any of this: they only open the deployed URL.

## Try it without a real key

A local mock server speaks both the OpenAI and Anthropic protocols.

```bash
npm run mock:provider
```

In NEXA, choose **Custom API** and enter:

| Field | Value |
| --- | --- |
| Base URL | `http://localhost:4010/v1` |
| API key | `mock-key` |
| Model | `mock-gpt` |

The model ID changes its behaviour: `mock-slow`, `mock-cut` (the stream breaks), `mock-401`, `mock-429`, `mock-500`, `mock-preview` (HTML and a diagram), `mock-echo` (repeats the system prompt it got) and `mock-gpt-tools` (calls a tool).

For tools, `npm run mock:mcp` starts a small MCP server. Add `http://localhost:4020/mcp` in Settings, under Tools.

## Test on a phone

Use a deployed preview, for example `vercel`, or an https tunnel. Opening the dev server by LAN IP over http isn't enough: browsers only offer the encryption API on https, so keys can't be stored there.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run lint` | ESLint |
| `npm run test` | Unit and integration tests |
| `npm run check` | All of the above, in order |
| `npm run build:pages` | Static build for GitHub Pages, into `out/` |

## Documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code is organised, and how to extend it |
| [PROVIDERS.md](PROVIDERS.md) | Connecting providers, custom APIs, CORS |
| [SECURITY.md](SECURITY.md) | The threat model, what is protected and what isn't |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deploying to Vercel, Cloudflare and Netlify |
| [DESIGN.md](DESIGN.md) | The design system |

## Known limits

These come from the platform, and NEXA states them instead of hiding them.

- **Browser CORS.** A provider that refuses browser requests can't be called directly. NEXA detects this and offers the opt-in relay.
- **Ctrl+N in a browser tab.** Browsers reserve it. It works in the installed app, and Alt+N works everywhere.
- **PDF export.** It uses the browser's print dialog, where Save as PDF is one choice.
- **Sharing.** It exports a self-contained HTML file. There is no hosted share link, because there is no backend.
- **Sync.** Data stays in one browser. Use backups to move it.
- **Voice input.** It depends on the browser's speech service, which may send audio to the browser's maker. Where a browser has none, such as Firefox, the microphone isn't offered.
