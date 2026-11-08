import { ArrowUp, ChevronDown, Paperclip, Plus, Search } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import type { HeroRoute } from "./hero-stage";

const CHATS = ["Understanding WebSockets", "Refactor the auth flow", "Lisbon in four days", "SQL window functions"];

function Conversation({ route }: { route: HeroRoute }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-5 pt-5 pb-3 sm:px-7">
        <p className="ml-auto w-fit max-w-[85%] rounded-md bg-surface px-3.5 py-2 text-sm">Explain how WebSockets work</p>
        <div className="space-y-2.5 text-sm leading-relaxed">
          <p>WebSockets keep one connection open, so the browser and server can both send a message at any time.</p>
          <div className="overflow-hidden rounded-md border border-border bg-code">
            <p className="border-b border-border px-3 py-1.5 text-xs text-muted">TypeScript</p>
            <pre className="overflow-hidden px-3 py-2.5 font-mono text-xs leading-relaxed">
              <span style={{ color: "var(--syntax-keyword)" }}>const</span> socket = <span style={{ color: "var(--syntax-keyword)" }}>new</span> <span style={{ color: "var(--syntax-title)" }}>WebSocket</span>(url);{"\n"}
              socket.<span style={{ color: "var(--syntax-title)" }}>send</span>(<span style={{ color: "var(--syntax-string)" }}>&quot;hello&quot;</span>);
            </pre>
          </div>
          <p>That removes the request-and-wait cycle of ordinary HTTP.</p>
        </div>
      </div>

      <div className="px-3 pb-1 sm:px-5">
        <div className="rounded-lg border border-accent bg-surface">
          <p className="px-3.5 pt-2.5 text-sm">And what about reconnecting?</p>
          <div className="flex items-center gap-2 px-2.5 pt-1 pb-2 text-muted">
            <Paperclip className="size-4" />
            <span key={route.model} className="fade-in flex min-w-0 items-center gap-1 text-xs font-medium">
              <span className="truncate">{route.model}</span>
              <ChevronDown className="size-3 shrink-0" />
            </span>
            <span className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-on-primary">
              <ArrowUp className="size-4" />
            </span>
          </div>
        </div>
        <div className="relative flex items-center gap-2 px-2 pt-2 pb-1.5">
          <span className="absolute top-0 bottom-1/2 left-[calc(0.5rem+2.5px)] w-px bg-accent/50" />
          <span className="size-1.5 shrink-0 rounded-full bg-accent" />
          <span className="h-px flex-1 bg-accent/40" />
          <span key={route.host} className="fade-in font-mono text-[0.6875rem] text-muted">
            {route.host}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The interface in a state it can really be in, at a smaller scale. Everything it shows is on the page in words. */
export function ProductPreview({ route }: { route: HeroRoute }) {
  return (
    <figure>
      <div aria-hidden="true" className="flex h-[27rem] overflow-hidden rounded-lg border border-border-strong bg-background shadow-float select-none sm:h-[30rem]">
        <div className="hidden w-52 shrink-0 flex-col gap-2 border-r border-border bg-background-deep p-2.5 sm:flex">
          <div className="flex items-center gap-2 px-1.5 py-1.5 text-sm">
            <LogoMark size={14} />
            <span className="font-display text-sm font-semibold tracking-[0.08em]">NEXA</span>
          </div>
          <p className="flex h-8 items-center gap-2 rounded-md border border-border-strong px-2.5 text-[0.8125rem]">
            <Plus className="size-3.5" />
            New chat
          </p>
          <p className="flex h-8 items-center gap-2 rounded-md border border-border px-2.5 text-[0.8125rem] text-faint">
            <Search className="size-3.5" />
            Search
          </p>
          <p className="mt-1 px-2 text-xs text-faint">Today</p>
          {CHATS.map((chat, index) => (
            <p key={chat} className={`truncate rounded-sm px-2 py-1 text-[0.8125rem] ${index === 0 ? "bg-accent-soft text-foreground" : "text-muted"}`}>
              {chat}
            </p>
          ))}
        </div>
        <Conversation route={route} />
      </div>
      <figcaption className="mt-2 text-xs text-faint">Example conversation.</figcaption>
    </figure>
  );
}
