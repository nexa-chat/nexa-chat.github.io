interface LogoMarkProps {
  size?: number | string;
  className?: string;
}

/**
 * Two terminals joined by one straight line: your browser, your provider, nothing between.
 * Read together, the three strokes make an N.
 */
export function LogoMark({ size = 20, className }: LogoMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M5 21V8" stroke="currentColor" strokeWidth="3" strokeLinecap="butt" />
      <path d="M19 3v13" stroke="currentColor" strokeWidth="3" strokeLinecap="butt" />
      <path d="M5 8l14 8" stroke="currentColor" strokeWidth="3" strokeLinecap="butt" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={18} />
      <span className="font-display text-[1.0625rem] font-semibold tracking-[0.08em]">NEXA</span>
    </span>
  );
}
