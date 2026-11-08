"use client";

import { Code2, FileText, Lightbulb, ListChecks, Moon, PenLine, Plus, Sunrise, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";
import { useActiveContext } from "@/hooks/use-active-model";
import { COMPOSER_INPUT_ID } from "@/hooks/use-shortcuts";
import { hostOf } from "@/lib/url";
import { useChatStore } from "./chat-store";
import { useProviderStore } from "../providers/provider-store";
import { useUiStore } from "../shell/ui-store";
import { t } from "@/i18n";

interface Starter {
  icon: LucideIcon;
  label: string;
  detail: string;
  prompt: string;
}

const EXPLAIN: Starter = { icon: Lightbulb, label: "Explain a concept", detail: "Clearly, with a small example", prompt: "Explain how WebSockets work, with a small example." };
const REVIEW: Starter = { icon: Code2, label: "Review code", detail: "Find bugs and suggest fixes", prompt: "Review this code for bugs and suggest fixes:\n\n" };
const DRAFT: Starter = { icon: PenLine, label: "Draft something", detail: "An email, a post, a message", prompt: "Help me write a short, clear email about " };
const PLAN: Starter = { icon: ListChecks, label: "Plan a task", detail: "Break it into small steps", prompt: "Help me plan this, step by step: " };
const DAY: Starter = { icon: Sunrise, label: "Plan my day", detail: "Priorities, in a realistic order", prompt: "Help me plan my day. Here is what I need to do: " };
const SUMMARY: Starter = { icon: FileText, label: "Summarize something", detail: "The key points, in a few lines", prompt: "Summarize this in a few clear points:\n\n" };
const THINK: Starter = { icon: Moon, label: "Think it through", detail: "Untangle a question, calmly", prompt: "Help me think this through: " };

/** The greeting and the four suggestions that fit the hour. */
function forTheHour(hour: number): { greeting: string; starters: readonly Starter[] } {
  if (hour >= 5 && hour < 12) return { greeting: "Good morning.", starters: [DAY, DRAFT, EXPLAIN, REVIEW] };
  if (hour >= 12 && hour < 18) return { greeting: "Good afternoon.", starters: [EXPLAIN, REVIEW, DRAFT, PLAN] };
  if (hour >= 18 && hour < 23) return { greeting: "Good evening.", starters: [SUMMARY, EXPLAIN, DRAFT, PLAN] };
  return { greeting: "Up late?", starters: [THINK, REVIEW, EXPLAIN, SUMMARY] };
}

function prefill(text: string): void {
  const input = document.getElementById(COMPOSER_INPUT_ID) as HTMLTextAreaElement | null;
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

/** A chat continued from a summary shows it, so the reader knows what the model knows. */
function ContinuedFrom() {
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === state.activeId));
  const source = useChatStore((state) => state.conversations.find((item) => item.id === conversation?.summaryOf));
  if (!conversation?.summary) return null;
  return (
    <details className="enter mt-6 w-full max-w-2xl rounded-xl border border-border bg-surface px-4 py-3 text-left">
      <summary className="cursor-pointer text-[0.8125rem] font-medium text-muted touch:min-h-11">{t("Continues")}{" "}{source ? `“${source.title}”` : "an earlier chat"}{t(", from this summary")}</summary>
      <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{conversation.summary}</p>
    </details>
  );
}

/** The project a new chat goes into. */
function ProjectLine() {
  const folderId = useChatStore((state) => state.conversations.find((item) => item.id === state.activeId)?.folderId ?? state.draftFolderId);
  const project = useChatStore((state) => state.folders.find((folder) => folder.id === folderId));
  if (!project) return null;
  return (
    <p className="mt-2 text-[0.8125rem] text-muted">
      {t("In project")}{" "}<span className="font-medium text-foreground">{project.name}</span>
      {project.instructions || project.files?.length ? t(", with its instructions and files") : ""}
    </p>
  );
}

/** Says, before anything is sent, which model answers and where the message goes. */
function Route() {
  const { model, provider } = useActiveContext();
  if (!model || !provider) return null;
  const relay = provider.connection === "relay";
  return (
    <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.9375rem] text-muted">
      <span>
        {t("Talking to")}{" "}<span className="font-medium text-foreground">{model.name}</span>
      </span>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-accent" />
        <span className="h-px w-8 bg-accent/50" />
      </span>
      <span>
        {relay ? t("through the relay to") : t("straight to")}{" "}
        <span className="font-mono text-[0.8125rem] text-foreground">{hostOf(provider.baseUrl)}</span>
      </span>
    </p>
  );
}

export function EmptyState() {
  const loaded = useProviderStore((state) => state.loaded);
  const hasProviders = useProviderStore((state) => state.providers.length > 0);
  const openWizard = useUiStore((state) => state.openWizard);
  const { model } = useActiveContext();

  if (!loaded) return <div className="flex-1" />;

  if (!hasProviders) {
    return (
      <div className="fade-in flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <LogoMark size={30} />
        </span>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">{t("Start a conversation")}</h1>
        <p className="mt-3 max-w-md text-[0.9375rem] text-muted">{t("Connect your first AI provider. Your key stays in this browser, and your messages go straight to the provider.")}</p>
        <Button variant="primary" size="l" className="mt-7" onClick={() => openWizard()}>
          <Plus />
          {t("Add your AI provider")}</Button>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="fade-in flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">{t("Add a model to begin")}</h1>
      </div>
    );
  }

  // The page only renders in the browser once providers load, so the hour is the reader's own.
  const { greeting, starters } = forTheHour(new Date().getHours());

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8 text-center sm:px-6">
      <span className="enter flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <LogoMark size={26} />
      </span>
      <p className="enter mt-5 text-[0.9375rem] text-muted">{t(greeting)}</p>
      <h1 className="enter mt-1 font-display text-3xl font-semibold tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">{t("What's on your mind?")}</h1>
      <Route />
      <ProjectLine />
      <ContinuedFrom />
      <ul className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {starters.map((starter, index) => (
          <li key={starter.label} className="enter" style={{ animationDelay: `${120 + index * 40}ms` }}>
            <button
              type="button"
              onClick={() => prefill(t(starter.prompt))}
              className="press group flex h-full w-full items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--foreground)_9%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-4 py-3.5 text-left transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--foreground)_16%,transparent)] hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.625rem] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] text-muted transition-colors duration-150 group-hover:text-accent">
                <starter.icon className="size-[1.125rem]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-medium">{t(starter.label)}</span>
                <span className="block text-[0.8125rem] text-muted">{t(starter.detail)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
