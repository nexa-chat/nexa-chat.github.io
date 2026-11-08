import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexa.example.com";
const description = "A private, provider-agnostic AI workspace built around your own API keys.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "NEXA: Your AI. Your API. Your control.", template: "%s | NEXA" },
  description,
  applicationName: "NEXA",
  openGraph: { title: "NEXA", description, url: siteUrl, siteName: "NEXA", type: "website" },
  twitter: { card: "summary_large_image", title: "NEXA", description },
  appleWebApp: { capable: true, title: "NEXA", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141210" },
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/** Runs before first paint so the page never flashes the wrong theme. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("nexa-theme")||"dark";var s=localStorage.getItem("nexa-text-size")||"default";var p=localStorage.getItem("nexa-palette")||"gold";if(t==="system"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}var r=document.documentElement;r.dataset.theme=t;r.dataset.textSize=s;r.dataset.palette=p;if(!localStorage.getItem("nexa-launched")&&location.pathname.indexOf("/chat")!==-1&&!matchMedia("(prefers-reduced-motion: reduce)").matches){r.dataset.launch="1"}}catch(e){}})();`;

/**
 * Static hosting can't send headers or a per-request nonce, so it gets this policy as a meta
 * tag. Next's inline scripts then need 'unsafe-inline': weaker than the nonce on a server,
 * which SECURITY.md says plainly.
 */
const STATIC_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http: ws: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

const STATIC_BUILD = process.env.NEXA_STATIC === "1";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = STATIC_BUILD ? undefined : ((await headers()).get("x-nonce") ?? undefined);

  return (
    <html lang="en" data-theme="dark" data-palette="gold" suppressHydrationWarning>
      <head>
        {STATIC_BUILD ? <meta httpEquiv="Content-Security-Policy" content={STATIC_CSP} /> : null}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
