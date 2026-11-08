"use client";

import { useEffect, useRef, useState } from "react";

const TEXT =
  "WebSockets keep one connection open between the browser and the server, so either side can send a message at any time. That removes the request-and-wait cycle of ordinary HTTP.";

/** A simulated stream, labelled as a demo. It plays when scrolled into view. */
export function StreamDemo() {
  const container = useRef<HTMLDivElement>(null);
  const [length, setLength] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setLength(TEXT.length);
        else setStarted(true);
      },
      { threshold: 0.6 },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => {
      setLength((value) => {
        if (value >= TEXT.length) {
          clearInterval(timer);
          return value;
        }
        const next = TEXT.indexOf(" ", value + 1);
        return next === -1 ? TEXT.length : next;
      });
    }, 45);
    return () => clearInterval(timer);
  }, [started]);

  const done = length >= TEXT.length;

  return (
    <div ref={container}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="w-fit max-w-[85%] rounded-md bg-surface px-3.5 py-2 text-sm">Explain how WebSockets work</p>
        <button
          type="button"
          onClick={() => {
            setLength(0);
            setStarted(false);
            requestAnimationFrame(() => setStarted(true));
          }}
          className="inline-flex min-h-11 shrink-0 items-center text-[0.8125rem] text-muted underline underline-offset-3"
        >
          Replay
        </button>
      </div>
      <p className={`min-h-[7.5em] leading-relaxed ${done ? "" : "caret-stream"}`}>{TEXT.slice(0, length)}</p>
      <p className="mt-2 text-xs text-faint">Simulated example. Real speed depends on your provider.</p>
    </div>
  );
}
