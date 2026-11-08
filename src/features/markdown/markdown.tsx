"use client";

import { ImageOff } from "lucide-react";
import { memo, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { hostOf } from "@/lib/url";
import { CodeBlock } from "./code-block";
import { hasMath, normalizeMathDelimiters, splitMarkdownBlocks } from "./split-blocks";

type PluginList = NonNullable<Options["remarkPlugins"]>;

const BASE_REMARK: PluginList = [remarkGfm];

interface MathPlugins {
  remark: PluginList;
  rehype: PluginList;
}

let mathLoading: Promise<MathPlugins> | undefined;

/** KaTeX is heavy, and most answers don't use it. */
function loadMath(): Promise<MathPlugins> {
  mathLoading ??= Promise.all([import("remark-math"), import("rehype-katex"), import("katex/dist/katex.min.css")]).then(
    ([remarkMath, rehypeKatex]) => ({
      remark: [[remarkMath.default, { singleDollarTextMath: true }]],
      rehype: [[rehypeKatex.default, { throwOnError: false, strict: "ignore", trust: false }]],
    }),
  );
  return mathLoading;
}

/**
 * Remote images load only on request. A model that saw hostile text could otherwise leak
 * conversation data in an image URL that the browser would fetch by itself.
 */
function RemoteImage({ src, alt }: { src: string; alt: string }) {
  const [allowed, setAllowed] = useState(false);
  if (allowed) {
    // eslint-disable-next-line @next/next/no-img-element -- remote user content, unknown dimensions
    return <img src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" />;
  }
  return (
    <button
      type="button"
      onClick={() => setAllowed(true)}
      className="press inline-flex max-w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-[0.8125rem] text-muted [@media(hover:hover)]:hover:bg-surface-hover"
    >
      <ImageOff className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">
        Load image from {hostOf(src)}
        {alt ? `: ${alt}` : ""}
      </span>
    </button>
  );
}

function languageOf(className: string | undefined): string {
  return /language-([\w+#.-]+)/.exec(className ?? "")?.[1] ?? "";
}

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

function createComponents(streaming: boolean): Components {
  return {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ),
    img: ({ src, alt }) => (typeof src === "string" && src ? <RemoteImage src={src} alt={alt ?? ""} /> : null),
    pre: ({ children }) => {
      const child = Array.isArray(children) ? children[0] : children;
      const props = (child as { props?: ComponentProps<"code"> } | undefined)?.props;
      return <CodeBlock code={textOf(props?.children).replace(/\n$/, "")} language={languageOf(props?.className)} streaming={streaming} />;
    },
    table: ({ children }) => (
      <div className="table-scroll" tabIndex={0}>
        <table>{children}</table>
      </div>
    ),
  };
}

const STATIC_COMPONENTS = createComponents(false);
const STREAMING_COMPONENTS = createComponents(true);

interface BlockProps {
  source: string;
  streaming: boolean;
}

const MarkdownBlock = memo(function MarkdownBlock({ source, streaming }: BlockProps) {
  const needsMath = useMemo(() => hasMath(source), [source]);
  const [math, setMath] = useState<MathPlugins | null>(null);

  useEffect(() => {
    if (!needsMath || math || streaming) return;
    let cancelled = false;
    void loadMath().then((plugins) => {
      if (!cancelled) setMath(plugins);
    });
    return () => {
      cancelled = true;
    };
  }, [needsMath, math, streaming]);

  const useMath = needsMath && math !== null;

  // No rehype-raw: raw HTML in a response renders as text and can never become markup.
  return (
    <ReactMarkdown
      remarkPlugins={useMath ? [...BASE_REMARK, ...math.remark] : BASE_REMARK}
      rehypePlugins={useMath ? math.rehype : undefined}
      components={streaming ? STREAMING_COMPONENTS : STATIC_COMPONENTS}
    >
      {useMath ? normalizeMathDelimiters(source) : source}
    </ReactMarkdown>
  );
});

interface MarkdownProps {
  content: string;
  streaming?: boolean;
}

export const Markdown = memo(function Markdown({ content, streaming = false }: MarkdownProps) {
  const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);

  return (
    <div className={`prose ${streaming ? "caret-stream-last" : ""}`}>
      {blocks.map((block, index) => (
        // Blocks only ever append during a stream, so the index is a stable identity.
        <MarkdownBlock key={index} source={block} streaming={streaming && index === blocks.length - 1} />
      ))}
    </div>
  );
});
