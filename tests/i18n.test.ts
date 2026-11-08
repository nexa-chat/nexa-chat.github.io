import { afterEach, describe, expect, it } from "vitest";
import { setLocale, t, tn } from "@/i18n";
import { fr } from "@/i18n/fr";

afterEach(() => setLocale("en"));

describe("t", () => {
  it("returns the English text by default", () => {
    expect(t("New chat")).toBe("New chat");
  });

  it("translates, and falls back to English for anything missing", () => {
    setLocale("fr");
    expect(t("New chat")).toBe("Nouvelle discussion");
    expect(t("A sentence nobody translated")).toBe("A sentence nobody translated");
  });

  it("fills placeholders after translating", () => {
    setLocale("fr");
    // French puts a no-break space before "?".
    expect(t("Delete {0}?", { 0: "GPT" })).toBe("Supprimer GPT ?");
  });

  it("picks singular or plural before translating", () => {
    setLocale("fr");
    expect(tn(1, "{count} model added.", "{count} models added.")).toBe("1 modèle ajouté.");
    expect(tn(3, "{count} model added.", "{count} models added.")).toBe("3 modèles ajoutés.");
  });
});

describe("the French dictionary", () => {
  const placeholders = (text: string): string[] => [...text.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map((match) => match[1] ?? "").sort();

  it("keeps every {placeholder} of the English text", () => {
    const broken = Object.entries(fr).filter(([english, french]) => placeholders(english).join() !== placeholders(french).join());
    expect(broken).toEqual([]);
  });

  it("keeps the technical {{variables}} of the custom HTTP body", () => {
    const body = "JSON. Use {{model}}, {{messages}}, {{prompt}}, {{system}} and {{stream}}.";
    for (const variable of ["{{model}}", "{{messages}}", "{{prompt}}", "{{system}}", "{{stream}}"]) expect(fr[body]).toContain(variable);
  });

  it("has no empty translations", () => {
    expect(Object.entries(fr).filter(([, french]) => !french.trim())).toEqual([]);
  });
});
