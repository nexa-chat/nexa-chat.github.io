"use client";

import { FileText, Languages, Lightbulb, Mail, Code2, Bookmark, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { getStorage } from "@/storage";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  template: string;
  icon: LucideIcon;
}

const BUILT_IN: readonly SlashCommand[] = [
  { id: "summarize", name: "summarize", description: "The key points, in a few lines", template: "Summarize this in a few clear points:\n\n", icon: FileText },
  { id: "translate", name: "translate", description: "Into the language you choose", template: "Translate this into {{language}}:\n\n", icon: Languages },
  { id: "explain", name: "explain", description: "Simply, with an example", template: "Explain this simply, with a small example:\n\n", icon: Lightbulb },
  { id: "review", name: "review", description: "Find bugs and suggest fixes", template: "Review this code for bugs and suggest fixes:\n\n", icon: Code2 },
  { id: "email", name: "email", description: "A short, clear email", template: "Write a short, clear email to {{recipient}} about {{subject}}.", icon: Mail },
];

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Built-in commands, then the user's saved prompts, which become /their-name. */
export function useSlashCommands(active: boolean): readonly SlashCommand[] {
  const [saved, setSaved] = useState<SlashCommand[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void getStorage()
      .getAll("prompts")
      .then((prompts) => {
        if (cancelled) return;
        setSaved(prompts.map((prompt) => ({ id: `prompt-${prompt.id}`, name: slug(prompt.name) || "prompt", description: prompt.description || t("Saved prompt"), template: prompt.prompt, icon: Bookmark })));
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return active ? [...BUILT_IN, ...saved] : [];
}

export function matchCommands(commands: readonly SlashCommand[], query: string): SlashCommand[] {
  const needle = query.toLowerCase();
  const starts = commands.filter((command) => command.name.startsWith(needle));
  const contains = commands.filter((command) => !command.name.startsWith(needle) && command.name.includes(needle));
  return [...starts, ...contains].slice(0, 8);
}

export const SLASH_LIST_ID = "slash-commands";

export function slashOptionId(command: SlashCommand): string {
  return `slash-${command.id}`;
}

/** The list above the composer. The textarea keeps focus and drives it with the arrow keys. */
export function SlashMenu({ commands, activeIndex, onPick, onHover }: { commands: readonly SlashCommand[]; activeIndex: number; onPick: (command: SlashCommand) => void; onHover: (index: number) => void }) {
  return (
    <div data-composer-layer className="absolute inset-x-3 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-border bg-surface-raised p-1 shadow-float sm:inset-x-5">
      <ul id={SLASH_LIST_ID} role="listbox" aria-label={t("Commands")}>
        {commands.map((command, index) => (
          <li
            key={command.id}
            id={slashOptionId(command)}
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => onHover(index)}
            onClick={() => onPick(command)}
            className={cn("flex cursor-pointer items-center gap-3 rounded-[0.625rem] px-3 py-2 touch:min-h-11", index === activeIndex && "bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]")}
          >
            <command.icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="font-mono text-[0.8125rem] text-foreground">/{command.name}</span>
            <span className="min-w-0 truncate text-[0.8125rem] text-muted">{t(command.description)}</span>
          </li>
        ))}
      </ul>
      <p className="px-3 pt-1 pb-1.5 text-[11px] text-faint max-md:hidden">{t("↑↓ to move · Enter to use · Esc to close")}</p>
    </div>
  );
}
