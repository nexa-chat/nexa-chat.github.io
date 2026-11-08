import { NexaError } from "./errors";

/** Removes trailing slashes and a pasted full endpoint, so a base URL can be joined safely. */
export function normalizeBaseUrl(input: string): string {
  return input
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(chat\/completions|completions|messages)$/i, "")
    .replace(/\/+$/, "");
}

export function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBaseUrl(baseUrl)}${suffix}`;
}

export function withQuery(url: string, params: readonly { name: string; value: string }[] = []): string {
  const usable = params.filter((param) => param.name.trim().length > 0);
  if (usable.length === 0) return url;
  const parsed = new URL(url);
  for (const param of usable) parsed.searchParams.set(param.name.trim(), param.value);
  return parsed.toString();
}

export function validateBaseUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return "Enter a base URL.";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "This isn't a valid URL. It should look like https://api.example.com/v1";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "The URL must start with https://";
  if (parsed.username || parsed.password) return "Remove the credentials from the URL and use the API key field.";
  return null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || host.endsWith(".localhost") || /^127\./.test(host);
}

/** True when a page on https would be blocked from calling this address over http. */
export function isMixedContent(targetUrl: string, pageProtocol: string): boolean {
  try {
    const target = new URL(targetUrl);
    return pageProtocol === "https:" && target.protocol === "http:" && !isLocalHost(target.hostname);
  } catch {
    return false;
  }
}

export function assertUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new NexaError("invalid_endpoint", { details: "The base URL could not be parsed." });
  }
}
