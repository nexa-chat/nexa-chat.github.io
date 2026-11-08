import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const LAYER = "col-start-1 row-start-1 transition-[opacity,scale,filter] duration-150 ease-out";

/**
 * Two icons in one place. On a change the old one blurs out as the new one blurs in, so the eye
 * reads one icon changing rather than two swapping. Used for Copy turning into a check.
 */
export function SwapIcon({ swapped, from, to, className }: { swapped: boolean; from: ReactNode; to: ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-grid place-items-center", className)}>
      <span className={cn(LAYER, swapped ? "scale-75 opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-0")}>{from}</span>
      <span className={cn(LAYER, swapped ? "scale-100 opacity-100 blur-0" : "scale-75 opacity-0 blur-[2px]")}>{to}</span>
    </span>
  );
}
