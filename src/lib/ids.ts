/** randomUUID needs a secure context, and a phone testing over a LAN address isn't one. */
function randomHex(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replaceAll("-", "");
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createId(prefix = ""): string {
  const id = randomHex();
  return prefix ? `${prefix}_${id}` : id;
}
