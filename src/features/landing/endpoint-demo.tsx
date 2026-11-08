"use client";

import { useMemo, useState } from "react";
import { UrlText } from "@/components/ui/url-text";
import { joinUrl, validateBaseUrl } from "@/lib/url";

const FIELD = "h-11 w-full rounded-md border border-border bg-background-deep px-3 font-mono text-sm transition-colors duration-100 focus:border-accent";

/** The real URL logic from the app, running on the page. Type anything. */
export function EndpointDemo() {
  const [baseUrl, setBaseUrl] = useState("https://api.example.com/v1");
  const endpoint = useMemo(() => (validateBaseUrl(baseUrl) ? null : joinUrl(baseUrl, "/chat/completions")), [baseUrl]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="demo-url" className="mb-1.5 block text-[0.8125rem] font-medium">
          Base URL
        </label>
        <input id="demo-url" className={FIELD} spellCheck={false} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium">API key</p>
          <p className={`${FIELD} flex items-center overflow-hidden text-muted`}>••••••••••••1234</p>
        </div>
        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium">Model</p>
          <p className={`${FIELD} flex items-center overflow-hidden text-muted`}>
            <span className="truncate">anthropic/claude-opus-4-7</span>
          </p>
        </div>
      </div>
      <p className="min-h-10 text-sm text-muted" aria-live="polite">
        {endpoint ? (
          <>
            NEXA calls <UrlText url={endpoint} className="text-[0.8125rem] text-foreground" />
          </>
        ) : (
          "That isn't a URL yet."
        )}
      </p>
    </div>
  );
}
