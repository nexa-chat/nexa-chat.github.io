/** A prompt template marks the parts to fill in with {{name}}. */
const VARIABLE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** The distinct variables of a template, in order of first appearance. */
export function templateVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(VARIABLE)) {
    const name = match[1]?.trim();
    if (name) seen.add(name);
  }
  return [...seen];
}

/** Fills each {{name}} with its value. A variable left empty is removed, not left as braces. */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(VARIABLE, (_match, name: string) => values[name.trim()] ?? "");
}
