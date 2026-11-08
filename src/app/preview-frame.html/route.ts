/**
 * The page inside the preview panel's iframe. The parent frames it with sandbox="allow-scripts"
 * and no allow-same-origin, so it runs at an opaque origin: it can't read this site's storage,
 * keys or chats. Its own policy also forbids network requests, so a preview can't send data out.
 * It receives the HTML to show through postMessage and writes it into itself.
 */

const FRAME_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="__POLICY__" />
    <title>Preview</title>
  </head>
  <body>
    <script>
      window.addEventListener("message", function (event) {
        if (event.source !== window.parent || !event.data || event.data.type !== "nexa-preview") return;
        document.open();
        document.write(String(event.data.html));
        document.close();
      });
      window.parent.postMessage({ type: "nexa-preview-ready" }, "*");
    </script>
  </body>
</html>`;

const FRAME_POLICY = [
  "default-src 'none'",
  // Generated pages often pull a library from a CDN, so https scripts and styles may load.
  "script-src 'unsafe-inline' https:",
  "style-src 'unsafe-inline' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "media-src data: blob:",
  // No fetch, XHR or WebSocket: nothing written in a preview can be sent anywhere.
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

export const dynamic = "force-static";

export function GET(): Response {
  // frame-ancestors only works as a header, so the meta copy leaves it out.
  const metaPolicy = FRAME_POLICY.split("; ")
    .filter((directive) => !directive.startsWith("frame-ancestors"))
    .join("; ");
  return new Response(FRAME_HTML.replace("__POLICY__", metaPolicy), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": FRAME_POLICY,
      "cache-control": "no-store",
    },
  });
}
