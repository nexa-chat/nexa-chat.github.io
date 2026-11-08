"use client";

import { ArrowLeft, ChartBar, Plug, Database, Keyboard, Layers, Menu as MenuIcon, MessageSquare, Palette, Server, ShieldCheck, SlidersHorizontal, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconButton } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-media-query";
import { ModelManager } from "../models/model-manager";
import { PrivacyCenter } from "../privacy/privacy-center";
import { ProviderManager } from "../providers/provider-manager";
import { useUiStore } from "../shell/ui-store";
import { DataSection } from "./data-section";
import { AdvancedSection, AppearanceSection, ChatSection, GeneralSection, KeyboardSection } from "./sections";
import { ToolsSection } from "./tools-section";
import { UsageSection } from "./usage-section";
import { t } from "@/i18n";
import { STATIC_BUILD, withBase } from "@/lib/base-path";

export const SETTINGS_SECTIONS = [
  { id: "general", label: "General", icon: SlidersHorizontal, render: GeneralSection },
  { id: "appearance", label: "Appearance", icon: Palette, render: AppearanceSection },
  { id: "providers", label: "Providers", icon: Server, render: ProviderManager },
  { id: "models", label: "Models", icon: Layers, render: ModelManager },
  { id: "chat", label: "Chat", icon: MessageSquare, render: ChatSection },
  { id: "usage", label: "Usage", icon: ChartBar, render: UsageSection },
  { id: "tools", label: "Tools", icon: Plug, render: ToolsSection },
  { id: "keyboard", label: "Keyboard", icon: Keyboard, render: KeyboardSection },
  { id: "privacy", label: "Privacy", icon: ShieldCheck, render: PrivacyCenter },
  { id: "data", label: "Data", icon: Database, render: DataSection },
  { id: "advanced", label: "Advanced", icon: Wrench, render: AdvancedSection },
] as const;

/**
 * Lives in the layout, so the tabs survive a section change and the indicator can travel.
 * Sections are client-side, so a tab switch only updates the URL: no server round trip.
 */
export function SettingsView() {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const pathname = usePathname();
  const mobile = useIsMobile();

  const section = pathname.split("/")[2] ?? "general";
  const current = SETTINGS_SECTIONS.find((item) => item.id === section) ?? SETTINGS_SECTIONS[0];
  const Body = current.render;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-3">
        <IconButton label={t("Open sidebar")} className="md:hidden" onClick={toggleSidebar}>
          <MenuIcon className="size-5" />
        </IconButton>
        <Link href="/chat" aria-label={t("Back to chat")} className="press flex size-9 items-center justify-center rounded-sm text-muted touch:size-11 [@media(hover:hover)]:hover:bg-surface-hover">
          <ArrowLeft className="size-[1.125rem]" />
        </Link>
        <h1 className="px-1 font-display text-[0.9375rem] font-semibold">{t("Settings")}</h1>
      </header>

      <Tabs
        value={current.id}
        orientation={mobile ? "horizontal" : "vertical"}
        onValueChange={(value) => window.history.pushState(null, "", withBase(`/settings/${String(value)}${STATIC_BUILD ? "/" : ""}`))}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="shrink-0 border-border max-md:overflow-x-auto max-md:overscroll-x-contain max-md:border-b md:w-52 md:border-r md:p-2.5">
          <TabsList aria-label={t("Settings sections")} className="max-md:w-max max-md:px-2 md:w-full">
            {SETTINGS_SECTIONS.map((item) => (
              <TabsTab key={item.id} value={item.id}>
                <item.icon aria-hidden="true" />
                {t(item.label)}
              </TabsTab>
            ))}
          </TabsList>
        </div>

        <TabsPanel value={current.id} className="min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
            <Body />
          </div>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
