# Product

<!-- impeccable:product-schema 1 -->

_Inferred from the founder's written brief (2026-11-07). The founder asked for autonomy on design and technical decisions, so no separate interview ran._

## Platform

web

## Stack

Next.js (App Router), TypeScript strict, React, Tailwind CSS. Pinned by the brief. Deploy target: Vercel first, Cloudflare and Netlify compatible.

## Users

People who already hold API keys, or who can get one in a few minutes: developers, technical power users and privacy-minded professionals. They use it for hours at a time, at a desk alongside an editor, and on their phone. Their job is to talk to the model they chose, on the account they pay for, without an intermediary.

## Product Purpose

NEXA is a universal AI chat client. Open the URL, add a provider (API key + base URL + model), chat. No NEXA account. Success is a first message streaming within two minutes of the first visit, and a client people keep open all day because it is faster and calmer than the vendors' own apps.

## Positioning

Your AI. Your API. Your control. NEXA runs in the browser and sends requests straight to the provider. It has no account, no server-side storage and no knowledge of conversation content. Any OpenAI-compatible or Anthropic-compatible endpoint works, including private gateways and local models reachable by URL.

## Operating Context

Long conversations, code-heavy answers, several providers side by side, switching models mid-task, pasting screenshots and dropping files. Keys are sensitive. Browser CORS is a real limitation: some providers refuse browser requests.

## Capabilities and Constraints

- Direct browser-to-provider requests by default. A relay is opt-in per provider, explicit, and stateless.
- All data is stored locally in IndexedDB. No analytics.
- Sharing, sync, accounts and teams do not exist yet. The product must not imply they do.
- Capabilities adapt per model: never send an unsupported parameter or attachment.

## Brand Commitments

- Name: NEXA. Tagline: "Your AI. Your API. Your control."
- Style words from the brief: premium, dark, minimal, technical, elegant. Dark is the default theme, with Light and System available.
- No blue base colour. The founder rejected it on 2026-11-07. Default look: warm stone and gold, with user-selectable palettes.
- Must work on phones as a first-class target, not a shrunken desktop.
- Logo: original minimal geometric symbol. No robot, no brain, no generic AI circle.
- UI language: English, as written in the brief.

## Evidence on Hand

No customers, testimonials, benchmarks or pricing exist. None may be invented. The only claims allowed are those the code makes true.

## Product Principles

1. Chat, streaming and custom APIs come first. They must be flawless before any extra.
2. Nothing fake: no dummy data, no dead button, no simulated capability. If the browser cannot do it, say so and say why.
3. The user's key never leaves their control without an explicit decision.
4. Speed is a feature. The interface should feel instant at 500+ messages.
5. Plain language by default, technical details on request.

## Accessibility & Inclusion

Reasonable WCAG AA: full keyboard use, screen reader labels, visible focus, reduced motion respected, touch targets at least 44px on mobile.
