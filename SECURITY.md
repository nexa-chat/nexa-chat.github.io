# Security

NEXA holds API keys that can spend someone's money. This document says what protects them, and where the protection ends.

## Principles

- Keys go to the provider the user chose, and nowhere else by default.
- Keys never appear in logs, URLs, analytics, error messages or backups, unless the user explicitly exports them.
- NEXA has no analytics, no telemetry and no server-side storage.

## How keys are stored

Keys sit in IndexedDB, encrypted with AES-GCM by `SecretVault`. The AES key is a non-extractable `CryptoKey`, so script can use it but can't read it. Each write uses a fresh IV. Secret custom headers are stored the same way.

**What this protects against:** reading the database files, browser profile backups, and casual inspection of storage.

**What this does not protect against:**

- Code running on this origin. It can't read the AES key, but it can ask the browser to decrypt. The CSP exists to stop such code from running.
- Malicious browser extensions with access to the page.
- Someone with access to the unlocked browser profile.

The Privacy Center tells users the same thing.

## Rendering model output

Model output is untrusted, because a model can repeat hostile text from a document it read.

- Markdown goes through `react-markdown` without `rehype-raw`, so raw HTML renders as text.
- URL schemes are filtered: `javascript:`, `vbscript:` and `data:` links are removed.
- **Remote images never load by themselves.** A prompt-injected response could otherwise leak conversation data in an image URL. The user sees the host and chooses to load it.
- Links open with `noopener noreferrer`.
- KaTeX runs with `trust: false`.
- highlight.js output is the only injected HTML, and it escapes its input.

## Content Security Policy

`src/proxy.ts` issues a nonce per request:

```
script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'
base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'
```

`connect-src` stays open to any host, by necessity: the user decides which provider to call. A successful script injection could therefore send data anywhere, which is why blocking script execution matters most. `style-src` allows inline styles, which the virtualised list and KaTeX need.

## Tools and MCP

Tools are off until the user turns them on, and they are only offered to models that support them. NEXA's own tools run in the browser and touch nothing. A tool from an MCP server runs only after the user approves the exact arguments shown, or always allows that tool; stopping an answer refuses pending calls. MCP servers are called straight from the browser, so they must allow this site through CORS. An Authorization value for a server is encrypted in the vault like an API key. Tool results are shown, and sent to the model, as text.

## Preview

Generated HTML runs in an iframe sandboxed with `allow-scripts` and without `allow-same-origin`. It runs at an opaque origin, so it can't read IndexedDB, keys or chats. Its page, `/preview-frame.html`, sets its own policy: `connect-src 'none'`, so nothing in a preview can send data out by fetch, XHR or WebSocket. It may load scripts, styles, fonts and images from https, because generated pages often use a CDN.

## Static hosting

On GitHub Pages, or any host that serves files only, there is no proxy to issue a nonce, so the policy is a meta tag that allows inline scripts, and there is no relay. Everything else here holds: keys stay encrypted in the browser and requests still go straight to the provider. A server deployment such as Vercel keeps the stricter nonce policy.

## The relay

`POST /api/relay` exists for providers that block browser requests.

- It's off for every provider until the user turns it on, and the screen states that the key and messages will pass through this deployment.
- It stores nothing and logs nothing. Whoever runs a deployment could change that, so users must trust that operator. This is stated in the interface.
- It only accepts requests from its own origin, or origins listed in `NEXA_RELAY_ALLOWED_ORIGINS`.
- It refuses non-https targets, credentials in URLs, local, private, link-local and metadata addresses, and internal hostnames.
- It resolves hostnames and refuses any that point to a private address, and it refuses redirects.
- It strips cookies and hop-by-hop headers.

**Known limits.** DNS could change between the check and the connection (DNS rebinding), which a stricter deployment would close by pinning the resolved IP. The origin check stops other websites, not scripts that forge an `Origin` header, so a public relay can be used as an open forwarder for https traffic. There is no rate limiting, because the relay keeps no state. For a public deployment, add rate limiting at the edge, or set `NEXA_RELAY_ENABLED=false`.

## File uploads

Files are read in the browser. Extensions are allow-listed, and images and PDFs must match their magic numbers. SVG is refused. Sizes are capped. Files reach only the provider of the selected model.

## Voice input

Dictation uses the browser's Web Speech API. Depending on the browser, audio goes to its maker's servers, for example Google in Chrome. It never passes through NEXA. The first use asks for agreement and states this, and the Privacy Center repeats it. Where the browser has no speech service, the microphone isn't offered. `Permissions-Policy` allows the microphone for this origin only.

## Backups

Keys are excluded by default. Including them needs a switch and a confirmation, and the file then contains them in plain text. Imported files are validated before anything is written, and replacing data needs a confirmation.

## Service worker

It caches the app shell and static assets. It ignores cross-origin requests and `/api/`, so provider traffic, keys and conversations never pass through it.

## Tests

`tests/security.test.tsx` covers XSS payloads, dangerous links, remote images, console silence, key redaction, and the relay's target and origin rules.

## Reporting a vulnerability

Report it privately to the project maintainer rather than in a public issue.
