import type { HLJSApi } from "highlight.js";

let loading: Promise<HLJSApi> | undefined;

/** The highlighter is only fetched once a code block appears. */
export function loadHighlighter(): Promise<HLJSApi> {
  loading ??= import("highlight.js/lib/common").then((module) => module.default);
  return loading;
}

const LANGUAGE_LABELS: Record<string, string> = {
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  sh: "Shell",
  bash: "Bash",
  shell: "Shell",
  zsh: "Shell",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  yaml: "YAML",
  yml: "YAML",
  md: "Markdown",
  markdown: "Markdown",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  cpp: "C++",
  csharp: "C#",
  cs: "C#",
  php: "PHP",
  rb: "Ruby",
  ruby: "Ruby",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  xml: "XML",
};

export function languageLabel(language: string): string {
  if (!language) return "Plain text";
  return LANGUAGE_LABELS[language.toLowerCase()] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

const FILE_EXTENSIONS: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  bash: "sh",
  shell: "sh",
  zsh: "sh",
  rust: "rs",
  ruby: "rb",
  markdown: "md",
  yaml: "yml",
  csharp: "cs",
  kotlin: "kt",
};

export function fileExtension(language: string): string {
  const key = language.toLowerCase();
  if (!key) return "txt";
  return FILE_EXTENSIONS[key] ?? (/^[a-z0-9]{1,6}$/.test(key) ? key : "txt");
}
