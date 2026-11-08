"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ProductPreview } from "./product-preview";

export interface HeroRoute {
  host: string;
  model: string;
}

/** Fictional only in that nothing is being sent: these are the routes a user could set up. */
const ROUTES: readonly HeroRoute[] = [
  { host: "api.anthropic.com", model: "Claude Opus 4.7" },
  { host: "api.openai.com", model: "GPT 5" },
  { host: "openrouter.ai", model: "DeepSeek R1" },
  { host: "api.mistral.ai", model: "Mistral Large" },
  { host: "localhost:11434", model: "Llama on your machine" },
];

function HostWire({ route }: { route: HeroRoute }) {
  return (
    <figure aria-label="Your browser connects straight to your provider, with no NEXA server in between." className="relative w-full">
      <span aria-hidden="true" className="absolute top-[0.625rem] -bottom-14 left-0 hidden w-px bg-border-strong lg:block" />
      <div aria-hidden="true" className="flex items-center gap-3">
        <span className="-ml-[4.5px] size-2.5 shrink-0 rounded-full bg-accent" />
        <span className="shrink-0 text-sm text-muted max-sm:hidden">Your browser</span>
        <span className="relative h-px min-w-8 flex-1 overflow-hidden bg-accent/40">
          <span className="absolute inset-y-0 left-0 w-1/4 bg-accent" style={{ animation: "wire-pulse 2.4s linear infinite" }} />
        </span>
        <span className="size-2.5 shrink-0 rounded-full border-2 border-foreground" />
        <span key={route.host} className="fade-in w-[9.5rem] shrink-0 truncate font-mono text-[0.8125rem] sm:w-[11rem]">
          {route.host}
        </span>
      </div>
      <figcaption className="mt-3 text-sm text-faint lg:pl-5">From your browser to your provider. No NEXA server on this line.</figcaption>
    </figure>
  );
}

/** One route drives the preview and the wire, so the page never tells two stories. */
export function HeroStage({ intro }: { intro: ReactNode }) {
  const [index, setIndex] = useState(0);
  const route = ROUTES[index] ?? { host: "api.anthropic.com", model: "Claude Opus 4.7" };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % ROUTES.length), 3200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid items-center gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div>{intro}</div>
      <div className="rise order-3 min-w-0 [--i:3] lg:order-none">
        <ProductPreview route={route} />
      </div>
      <div className="rise order-2 [--i:5] lg:order-none lg:col-span-2 lg:mt-4">
        <HostWire route={route} />
      </div>
    </div>
  );
}
