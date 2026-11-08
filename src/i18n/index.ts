/**
 * The interface's language. English is the source: each English text is its own key, so a
 * missing translation simply shows the English, and nothing is ever blank.
 *
 * t() is a plain function, usable in components, menus and toasts alike. Changing the language
 * remounts the app shell, so every visible text is read again.
 */

import { fr } from "./fr";

export type Locale = "en" | "fr";
export type LanguageSetting = "auto" | Locale;

const DICTIONARIES: Record<Locale, Readonly<Record<string, string>> | undefined> = { en: undefined, fr };

let current: Locale = "en";

export function resolveLocale(setting: LanguageSetting): Locale {
  if (setting !== "auto") return setting;
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Translates an English text, then fills {name} placeholders from vars. */
export function t(text: string, vars?: Readonly<Record<string, string | number>>): string {
  const translated = DICTIONARIES[current]?.[text] ?? text;
  if (!vars) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Plural-aware: picks the singular or plural English form, then translates it. */
export function tn(count: number, singular: string, plural: string, vars?: Readonly<Record<string, string | number>>): string {
  return t(count === 1 ? singular : plural, { count, ...vars });
}
