import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { EndpointDemo } from "./endpoint-demo";
import { HeroStage } from "./hero-stage";
import { StreamDemo } from "./stream-demo";

const PRIMARY = "press inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors duration-100 [@media(hover:hover)]:hover:bg-primary-hover";
const SECONDARY = "press inline-flex h-12 items-center justify-center rounded-md border border-border-strong px-6 font-medium transition-colors duration-100 [@media(hover:hover)]:hover:bg-surface-hover";

function Station({ title, body, children }: { title: string; body: ReactNode; children: ReactNode }) {
  return (
    <section className="relative grid gap-x-12 gap-y-6 py-14 pl-7 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:py-20 md:pl-12">
      <span aria-hidden="true" className="absolute top-[4.25rem] left-0 size-2.5 -translate-x-[4.5px] rounded-full border-2 border-accent bg-background md:top-[5.75rem]" />
      <div>
        <h2 className="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.015em] text-balance">{title}</h2>
        <div className="mt-3 max-w-[42ch] leading-relaxed text-muted">{body}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const MODELS = [
  { name: "Claude Opus 4.7", provider: "Anthropic", capabilities: "Vision · Tools · Reasoning" },
  { name: "GPT 5", provider: "OpenAI", capabilities: "Vision · Tools · Reasoning" },
  { name: "Gemini", provider: "Google", capabilities: "Vision · Tools" },
  { name: "Llama", provider: "Your own server", capabilities: "Tools" },
];

function ModelList() {
  return (
    <div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {MODELS.map((model) => (
          <li key={model.name} className="flex flex-col gap-x-4 gap-y-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="font-medium">{model.name}</span>
            <span className="text-[0.8125rem] text-muted">
              {model.provider}, {model.capabilities}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-faint">Example. Your list shows the models you add.</p>
    </div>
  );
}

function PrivacyTable() {
  const rows: [string, string][] = [
    ["API keys", "Stay in this browser, encrypted"],
    ["Conversations", "Stay in this browser"],
    ["Files you attach", "Read in this browser, sent only to your model"],
    ["Messages you send", "Go to the provider you chose"],
    ["Analytics", "There are none"],
  ];
  return (
    <dl className="divide-y divide-border border-y border-border">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-x-6 gap-y-0.5 py-3 sm:flex-row sm:justify-between">
          <dt className="font-medium">{label}</dt>
          <dd className="text-muted">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function KeyRow() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-md border border-border-strong px-4 py-3.5">
        <span className="min-w-0 truncate font-mono text-sm">••••••••••••••••1234</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[0.8125rem] text-muted">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          Connected
        </span>
      </div>
      <p className="text-sm text-pretty text-muted">No NEXA account, no subscription, no markup. You pay your provider directly, at their prices.</p>
      <p className="text-xs text-faint">Example of a saved key.</p>
    </div>
  );
}

export function Landing() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="NEXA home" className="inline-flex min-h-11 items-center">
          <LogoMark size={20} />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-5">
          <Link href="/settings/privacy" className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm text-muted [@media(hover:hover)]:hover:text-foreground">
            Privacy
          </Link>
          <Link href="/chat" className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium">
            Open NEXA
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-5 pt-[clamp(1.5rem,6svh,4.5rem)] pb-14 sm:px-8">
          <HeroStage
            intro={
              <>
                <h1 className="font-display text-[clamp(3rem,5.5vw,4.75rem)] leading-[1] font-semibold tracking-[-0.03em] whitespace-nowrap">
                  <span className="rise mb-3 flex items-center gap-3 tracking-[0.02em]">
                    <LogoMark size="0.86em" className="shrink-0 text-accent" />
                    NEXA
                  </span>
                  <span className="rise block [--i:1]">Your AI.</span>
                  <span className="rise block [--i:2]">Your API.</span>
                  <span className="rise block text-accent [--i:3]">Your control.</span>
                </h1>
                <p className="rise mt-6 max-w-[34ch] text-lg leading-snug text-muted [--i:4] sm:text-xl">A private, provider-agnostic AI workspace built around your own API keys.</p>
                <div className="rise mt-8 flex flex-wrap gap-3 [--i:5]">
                  <Link href="/chat" className={PRIMARY}>
                    Start chatting
                  </Link>
                  <Link href="/chat?setup=provider" className={SECONDARY}>
                    Configure provider
                  </Link>
                </div>
              </>
            }
          />
        </section>

        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="border-l border-border-strong">
            <Station title="Bring your own key" body="Paste a key from any provider and start. It's encrypted in your browser and sent straight to that provider.">
              <KeyRow />
            </Station>

            <Station title="Connect any API" body="OpenAI-compatible, Anthropic-compatible, a private gateway, or a model on your own machine. Three fields, then a connection test.">
              <EndpointDemo />
            </Station>

            <Station title="Every model, one place" body="Keep them in one list and switch mid-conversation. NEXA adapts to what each model can do, so a text model is never sent an image.">
              <ModelList />
            </Station>

            <Station title="Private by design" body="NEXA keeps no database of your conversations. They live in your browser. When a provider refuses browser requests, NEXA says so and lets you decide what to do.">
              <PrivacyTable />
            </Station>

            <Station title="Answers as they're written" body="Tokens appear the moment your provider sends them. Stop whenever you like, and long chats stay smooth.">
              <StreamDemo />
            </Station>
          </div>
        </div>

        <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-5 pt-16 pb-24 sm:px-8">
          <h2 className="max-w-[16ch] font-display text-[clamp(2.25rem,6vw,4rem)] leading-[1.02] font-semibold tracking-[-0.02em] text-balance">Open it and start. No sign-up.</h2>
          <Link href="/chat" className={PRIMARY}>
            Start chatting
          </Link>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-faint sm:px-8">
          <span className="flex items-center gap-2">
            <LogoMark size={14} />
            Your AI. Your API. Your control.
          </span>
          <Link href="/settings/privacy" className="inline-flex min-h-11 items-center [@media(hover:hover)]:hover:text-foreground">
            Privacy Center
          </Link>
        </div>
      </footer>
    </div>
  );
}
