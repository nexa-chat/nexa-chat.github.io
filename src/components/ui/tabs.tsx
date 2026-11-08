"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Adapted from coss ui's tabs, on Base UI. Keyboard handling and the indicator's measured
 * position come from Base UI. Colours use NEXA's tokens, and the underline is the accent.
 */
export function Tabs({ className, ...props }: TabsPrimitive.Root.Props): ReactElement {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-2 data-[orientation=vertical]:flex-row", className)} data-slot="tabs" {...props} />;
}

export function TabsList({ className, children, ...props }: TabsPrimitive.List.Props): ReactElement {
  return (
    <TabsPrimitive.List
      className={cn("relative z-0 flex w-fit items-center gap-x-0.5 text-muted data-[orientation=vertical]:flex-col data-[orientation=vertical]:px-1 data-[orientation=horizontal]:py-1", className)}
      data-slot="tabs-list"
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        className="absolute bottom-0 left-0 z-10 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-(--active-tab-bottom) bg-accent transition-[width,translate] duration-200 ease-out motion-reduce:transition-none data-[orientation=horizontal]:h-0.5 data-[orientation=horizontal]:translate-y-px data-[orientation=vertical]:w-0.5 data-[orientation=vertical]:-translate-x-px"
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  );
}

export function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props): ReactElement {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap transition-[color,background-color] duration-100 touch:h-11",
        "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-active:text-foreground [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-foreground",
        "focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      data-slot="tabs-tab"
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props): ReactElement {
  return <TabsPrimitive.Panel className={cn("min-w-0 flex-1 outline-none", className)} data-slot="tabs-content" {...props} />;
}
