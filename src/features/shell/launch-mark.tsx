"use client";

import { useEffect } from "react";

const LAUNCH_KEY = "nexa-launched";

function finish(): void {
  delete document.documentElement.dataset.launch;
}

/**
 * The first time the app opens, its N draws itself stroke by stroke, then lifts away after a
 * second. It never shows again, never under reduced motion, and a click skips it. The early
 * theme script decides whether it shows, so it is there from the first frame.
 */
export function LaunchMark() {
  useEffect(() => {
    if (!document.documentElement.dataset.launch) return;
    try {
      localStorage.setItem(LAUNCH_KEY, "1");
    } catch {
      // It will simply show again next time.
    }
    const timer = window.setTimeout(finish, 1300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div aria-hidden="true" className="launch-mark" onClick={finish}>
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
        <path d="M5 21V8" stroke="currentColor" strokeWidth="3" pathLength={1} />
        <path d="M5 8l14 8" stroke="currentColor" strokeWidth="3" pathLength={1} />
        <path d="M19 16V3" stroke="currentColor" strokeWidth="3" pathLength={1} />
      </svg>
    </div>
  );
}
