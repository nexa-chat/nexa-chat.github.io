const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|pk|rk|gsk|xai|key|api)[-_][A-Za-z0-9_-]{12,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\b(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
];
const QUERY_SECRET = /([?&](?:api[_-]?key|key|token|access_token|auth)=)[^&\s"']+/gi;
const REDACTED = "[redacted]";

/** Removes known secrets and anything shaped like a credential. Applied to all error text. */
export function redactSecrets(text: string, knownSecrets: readonly string[] = []): string {
  let result = text;
  for (const secret of knownSecrets) {
    if (secret.length >= 4) result = result.split(secret).join(REDACTED);
  }
  for (const pattern of CREDENTIAL_PATTERNS) result = result.replace(pattern, REDACTED);
  return result.replace(QUERY_SECRET, `$1${REDACTED}`);
}

/** Masks a key for display: bullets followed by the last four characters. */
export function maskKey(hint: string | undefined): string {
  return hint ? `${"•".repeat(16)}${hint}` : "";
}

/** Never empty for a real key: the UI reads an empty hint as "no key stored". */
export function keyHint(key: string): string {
  if (!key) return "";
  return key.length > 8 ? key.slice(-4) : "••••";
}
