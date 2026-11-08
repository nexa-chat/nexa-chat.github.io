import { NextResponse, type NextRequest } from "next/server";

/**
 * A per-request nonce keeps injected markup from running script, which matters in an app
 * that holds API keys. connect-src stays open on purpose: the user decides which provider
 * to call, and that can be any host.
 */
function contentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: http: ws: wss:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    // 'self', not 'none': the image export renders through a same-origin <base>. External bases stay blocked.
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|preview-frame|_next/static|_next/image|favicon|icon|apple-icon|sw.js|manifest|pdf.worker|robots.txt|sitemap.xml).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
