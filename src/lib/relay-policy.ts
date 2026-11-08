import { isLocalHost } from "./url";

const PRIVATE_IPV4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const BLOCKED_SUFFIXES = [".internal", ".local", ".localdomain", ".intranet", ".lan"];

/** True for loopback, private, link-local and carrier-grade NAT addresses. */
export function isPrivateAddress(address: string): boolean {
  const value = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (!value.includes(":")) return PRIVATE_IPV4.some((pattern) => pattern.test(value));
  if (value.startsWith("::ffff:")) return true;
  return value === "::1" || value === "::" || /^f[cd]/.test(value) || /^fe[89ab]/.test(value);
}

/**
 * Stops the relay from being used to reach the deployment's own network. Returns the reason
 * when a target is refused. The route also checks what a hostname resolves to.
 */
export function isBlockedTarget(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return "The relay needs a valid URL.";
  }

  if (url.protocol !== "https:") return "The relay only connects to https:// addresses.";
  if (url.username || url.password) return "The relay refuses URLs containing credentials.";

  const host = url.hostname.toLowerCase();
  if (isLocalHost(host)) return "The relay can't reach local addresses. Use a direct connection for local models.";
  if (isPrivateAddress(host)) return "The relay can't reach private network addresses.";
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix)) || !host.includes(".")) return "The relay can't reach internal hostnames.";
  return null;
}

/** Only pages from this deployment, or origins it lists, may use the relay. */
export function relayAllowedOrigin(origin: string | null, selfOrigin: string, allowList: string | undefined): boolean {
  if (!origin) return false;
  if (origin === selfOrigin) return true;
  return (allowList ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(origin);
}
