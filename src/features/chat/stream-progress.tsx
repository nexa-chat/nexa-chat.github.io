"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "./chat-store";

/**
 * A 2px line under the header while an answer streams. Nobody knows an answer's length in
 * advance, so it is not a percentage: it creeps toward the end as text arrives, then
 * completes and fades when the answer ends.
 */
export function StreamProgress() {
  const length = useChatStore((state) => {
    const stream = state.activeId ? state.streams[state.activeId] : undefined;
    return stream ? stream.text.length + stream.reasoning.length : -1;
  });
  const live = length >= 0;
  const [wasLive, setWasLive] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // The end of a stream is a change between renders, worked out here rather than in an effect.
  if (live !== wasLive) {
    setWasLive(live);
    if (!live) setFinishing(true);
  }

  useEffect(() => {
    if (!finishing) return;
    const timer = window.setTimeout(() => setFinishing(false), 450);
    return () => window.clearTimeout(timer);
  }, [finishing]);

  if (!live && !finishing) return null;
  const progress = finishing ? 1 : 0.08 + 0.84 * (1 - Math.exp(-length / 1800));

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
      <div
        className={`h-full origin-left bg-accent transition-[transform,opacity] duration-300 ease-out ${finishing ? "opacity-0 delay-200" : "opacity-100"}`}
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
