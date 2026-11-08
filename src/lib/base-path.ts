/**
 * Where the app lives under its domain. Empty on Vercel or a custom domain, "/NEXA" on
 * https://<user>.github.io/NEXA/. Next's <Link> and router add it on their own; this is for
 * the places that talk to the browser directly: the History API, fetch, workers, iframes.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}

/** A browser pathname, without the base, as the app's own routes see it. */
export function stripBase(pathname: string): string {
  return BASE_PATH && pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) || "/" : pathname;
}

/** True when this build is static files only, as on GitHub Pages: no relay, no server. */
export const STATIC_BUILD = process.env.NEXT_PUBLIC_STATIC_BUILD === "1";
