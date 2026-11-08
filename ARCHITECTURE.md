# Architecture

NEXA is a client-side application served by Next.js. The server renders the shell, sets security headers, and hosts one optional route: the relay. Everything else runs in the browser.

```
Browser
  UI (features/, components/)
    |
  Stores (zustand: chat, providers, settings, ui)
    |
  Services (generation, context, backup, search, files, titles)
    |                          |
  ProviderAdapter            StorageAdapter
  (providers/)               (storage/)
    |                          |
  HttpClient (lib/http)      IndexedDB + SecretVault
    |
    +--> Provider API, directly (default)
    +--> /api/relay --> Provider API (only if enabled for that provider)
```

## Layout

| Folder | Responsibility |
| --- | --- |
| `src/app` | Routes, metadata, the relay route. No business logic. |
| `src/proxy.ts` | Per-request CSP nonce. |
| `src/types` | Shared domain types, including `Tool`, `ToolCall` and `ToolResult`. |
| `src/lib` | Pure utilities: errors, SSE parsing, HTTP, retry, redaction, URLs. |
| `src/providers` | `ProviderAdapter`, `ProviderRegistry`, one folder per API family. |
| `src/storage` | `StorageAdapter`, `IndexedDBStorage`, `MemoryStorage`, `SecretVault`. |
| `src/services` | Framework-free logic. Testable without React. |
| `src/features` | Product areas: chat, composer, markdown, sidebar, palette, providers, models, settings, privacy, landing, shell. |
| `src/components` | The design system: button, field, dialog, menu, toast, confirm. |
| `src/hooks` | Shared React hooks. |
| `src/styles` | Design tokens and prose styles. |

## Providers

Every provider implements `ProviderAdapter`:

```ts
initialize()
validateConnection(modelId?, signal?)
sendMessage(request)
streamMessage(request)
listModels(signal?)
supportsFeature(feature)
normalizeError(error)
resolveChatUrl(modelId, stream)
```

`BaseAdapter` holds what they share: auth, headers, URL building, connection tests and parameter recovery. An adapter only describes its wire format: paths, body shape, and how to decode a stream.

Adapters turn every API into one stream of events:

```ts
text | reasoning | tool_call | usage | finish | param_dropped
```

### Adding a provider

1. Create `src/providers/<name>/adapter.ts` extending `BaseAdapter`, or `OpenAIAdapter` if it is a dialect.
2. Register it in `src/providers/index.ts`.
3. Optionally add a preset in `src/providers/presets.ts`.

Nothing else changes. The UI reads the registry and the model's capabilities.

### Unsupported parameters

There is no table of which model accepts which parameter, because such a table goes stale. Only configured parameters are sent. If a provider answers 400 and names a parameter, `detectUnsupportedParam` finds it, the request is resent without it, and the model records it in `unsupportedParams` so it is never sent again. `max_tokens` becomes `max_completion_tokens` the same way.

### Capabilities

Each model stores `supportsVision`, `supportsTools`, `supportsStreaming`, `supportsReasoning`, `supportsImages` and `supportsFiles`. They come from provider metadata when available, then a name-based guess, and the user can override them. The interface and the request builder both read them, so an image is never sent to a model without vision.

## Streaming

1. `readText` decodes bytes with a streaming `TextDecoder`, so a character split across chunks survives, and it watches for silence.
2. `SseDecoder` or `NdjsonDecoder` reassembles events across any chunk boundary.
3. The adapter maps events. A malformed chunk is skipped. A stream that closes with no end marker raises `stream_interrupted`.
4. `runGeneration` retries only before the first token, because resending after that would bill twice and duplicate output.
5. `chat-actions` coalesces tokens to one store update per animation frame, and persists every 1.5 seconds.

Only the streaming row subscribes to the live stream. Markdown is split into blocks memoised by content, so a token re-parses the last block alone. Highlighting waits until a code block finishes.

## State

Four small stores, split by concern:

| Store | Holds |
| --- | --- |
| `chat-store` | Conversations, folders, active messages, live streams |
| `provider-store` | Providers, models |
| `settings-store` | User settings |
| `ui-store` | Sidebar, palette, dialogs |

## Branches

A chat is a tree. Each message stores `parentId`, and Retry, Regenerate, Edit and "Ask another model" add a sibling instead of overwriting anything. The store's `messages` is only the branch on screen, so the virtual list, the context sent to the model and the exports keep working on a plain list. `Conversation.activeLeafId` remembers which branch is shown; when unset, the newest message wins. The tree logic is pure and lives in `services/branches.ts`. Chats saved before branches existed are linked into a single line the first time they open.

## Usage and estimates

`services/usage.ts` totals the token counts providers returned, and the costs computed from the prices the user entered, per month and per model. The composer shows an estimate before sending: about four characters per token for the whole chat plus the draft. It is labelled as an estimate everywhere, since real tokenizers differ.

## Tools and MCP

`services/tools/registry.ts` gathers the tools a model may call: NEXA's own (`nexa__calculator`, `nexa__current_time`), which run in the browser, and those of enabled MCP servers, named `server__tool`. `services/mcp.ts` is a small Streamable HTTP client: initialize, tools/list, tools/call, JSON or SSE answers, and the session header. The loop lives in `chat-actions.ts`: an answer with tool calls is saved, each call runs (a server's tool only after `requestApproval` resolves), the results are saved as a `tool` message, and the model answers again, up to six rounds. Every call gets a result, refusals included, and `buildChatMessages` drops calls that never got one, because providers reject them.

## Projects, fallback and summaries

A folder is also a project: its instructions and the text of its files go into the system prompt through `composeSystem`, with the chat's own instructions and the summary of the chat it continues. When the chosen model fails on the provider's side before any text arrives, `generate` runs again with `settings.fallbackModelId` and records `fellBackFrom` on the answer. A summary is written with the chat's model, or the fallback, and starts a new chat; the original is untouched.

## Preview

Code blocks in HTML, SVG or Mermaid can open in the preview panel. It frames `/preview-frame.html`, a route with its own policy (no network, no base), in an iframe sandboxed without `allow-same-origin`, so it runs at an opaque origin away from storage and keys. The code arrives by postMessage. Mermaid renders in the app in strict mode, and the frame only receives SVG.

## Languages

Every interface text goes through `t()` from `src/i18n`, with the English text as its key, so a missing translation shows English, never a blank. `src/i18n/fr.ts` holds French. The app shell remounts when the language changes, so every text is read again; until settings load it renders English, like the server, so hydration matches. Text sent to models (system prompts, tool results) stays English. The landing page is English only.

## Local servers

`services/local-servers.ts` looks for Ollama and LM Studio on localhost, only when the user asks, because browsers may prompt before a site reaches the local network. A normal request that fails is retried as an opaque one: if that succeeds, a server is running but refuses this site through CORS, and the wizard says how to allow it.

## UI components

`src/components/ui` follows the shadcn layout (`components.json`, `cn` in `src/lib/utils.ts`), so `npx shadcn add` works. Several components are adapted from 21st.dev and coss ui: `ai-chat-input` (composer), `tabs` (settings), `notifications-5` (toasts and error cards) and `sidebar`. They are presentational. Chat logic stays in `src/features`, and colours come from NEXA's tokens. In this project `muted` is a text colour and `accent` is the brand colour, unlike stock shadcn, so pasted components need their classes mapped.

## Mobile

Below 768px, floating panels become bottom sheets and the sidebar becomes a drawer, both built on vaul. `Popover` and `Menu` choose by themselves, so call sites don't change. Forms stay in the native `<dialog>`, which anchors to the bottom on phones and keeps the browser's focus handling. `useKeyboardAwareHeight` sizes the shell from the visual viewport, because iOS doesn't resize the layout for the keyboard.

## Theming

`src/styles/tokens.css` holds every colour. A palette sets a hue, a tint strength and an accent, and the neutrals derive from them. Browser chrome can't read CSS variables, so `src/lib/palettes.ts` holds the matching hex values for the status bar. After changing a palette, measure contrast across all palettes in both themes.

## Performance

- The message list is virtualised, so about ten rows exist in the DOM at any length.
- KaTeX, highlight.js, pdf.js and fflate load on first use.
- Fonts are self-hosted through Fontsource.

## Extending later

The seams exist. None of these features are built.

| Future feature | Where it plugs in |
| --- | --- |
| Accounts, cloud sync | Implement `StorageAdapter` as `CloudStorage`. |
| Tools, MCP, agents | Adapters already serialise `ToolDefinition` and parse tool calls. Add a registry and a loop in `services/generation.ts`. |
| Web search, image generation, voice | New `ProviderFeature` values and message parts. |
| Shared conversations, teams | `services/export.ts` already produces a portable document. Add a backend behind it. |
| Artifacts, projects | `Conversation.metadata` and new features under `src/features`. |
