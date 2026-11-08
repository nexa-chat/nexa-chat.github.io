import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * NEXA_STATIC=1 builds plain files for GitHub Pages (see scripts/build-pages.mjs). There,
 * headers can't be set, so the CSP comes from a meta tag in the root layout instead.
 */
const staticExport = process.env.NEXA_STATIC === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const serverConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      // The preview panel frames this one page from the same site, sandboxed.
      { source: "/preview-frame.html", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

const staticConfig: NextConfig = { output: "export", trailingSlash: true, basePath, images: { unoptimized: true } };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(staticExport ? staticConfig : serverConfig),
};

export default nextConfig;
