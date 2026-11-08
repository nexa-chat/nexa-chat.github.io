"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useRef, type ReactNode, type TouchEvent } from "react";
import { Drawer } from "vaul";
import { ConfirmHost } from "@/components/ui/confirm";
import { Toaster, toast } from "@/components/ui/toast";
import { useIsMobile } from "@/hooks/use-media-query";
import { useOnline } from "@/hooks/use-online";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { initStorage } from "@/storage";
import { useChatStore } from "../chat/chat-store";
import { CommandPalette } from "../palette/command-palette";
import { LaunchMark } from "./launch-mark";
import { useProviderStore } from "../providers/provider-store";
import { ProviderWizard } from "../providers/provider-wizard";
import { useSettingsStore } from "../settings/settings-store";
import { AppSidebar } from "../sidebar/sidebar";
import { restoreUiPreferences, useUiStore } from "./ui-store";
import { t } from "@/i18n";
import { resolveLocale, setLocale, type Locale } from "@/i18n";
import { STATIC_BUILD, withBase } from "@/lib/base-path";

const EDGE_ZONE_PX = 24;
const SWIPE_DISTANCE_PX = 60;

function conversationFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("c");
}

function useBootstrap(): void {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      restoreUiPreferences();
      const { persistent } = await initStorage();
      await Promise.all([useSettingsStore.getState().load(), useProviderStore.getState().load(), useChatStore.getState().load()]);
      if (cancelled) return;

      if (!persistent) toast.warning(t("This browser is blocking storage. Nothing will be saved after you close this tab."));
      const id = conversationFromUrl();
      if (id) void useChatStore.getState().openConversation(id, { replace: true });
      if (new URLSearchParams(window.location.search).get("setup") === "provider") {
        window.history.replaceState(null, "", withBase(STATIC_BUILD ? "/chat/" : "/chat"));
        useUiStore.getState().openWizard();
      }
    })();

    const onPopState = (): void => {
      const id = conversationFromUrl();
      if (id) void useChatStore.getState().openConversation(id, { replace: true });
      else useChatStore.getState().newChat();
    };
    window.addEventListener("popstate", onPopState);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
}

function useSystemTheme(): void {
  const theme = useSettingsStore((state) => state.settings.theme);
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = (): void => {
      document.documentElement.dataset.theme = query.matches ? "light" : "dark";
    };
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);
}

/**
 * iOS doesn't resize the layout for the keyboard, so a bottom composer would end up behind
 * it. The visual viewport reports the height that is really visible.
 */
function useKeyboardAwareHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = (): void => {
      // While pinch-zoomed, the visible area isn't the layout's business.
      if (viewport.scale > 1.01) return;
      document.documentElement.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
      if (viewport.offsetTop > 0) window.scrollTo(0, 0);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);
}

function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p role="status" className="flex shrink-0 items-center justify-center gap-2 bg-surface px-3 py-1.5 text-[0.8125rem] text-muted">
      <WifiOff className="size-3.5" aria-hidden="true" />
      {t("You're offline. Your conversations are still here.")}</p>
  );
}

/**
 * The interface language. Every text goes through t(), which reads the current locale, so a
 * change remounts the shell below and everything is read again. Until settings load, it stays
 * English, like the server render, so hydration matches.
 */
function useInterfaceLocale(): Locale {
  const loaded = useSettingsStore((state) => state.loaded);
  const language = useSettingsStore((state) => state.settings.language);
  const locale = loaded ? resolveLocale(language) : "en";
  // A plain module value, set before children read it. Idempotent, so safe during render.
  setLocale(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return locale;
}

export function AppShell({ children }: { children: ReactNode }) {
  useBootstrap();
  const locale = useInterfaceLocale();
  useSystemTheme();
  useShortcuts();
  useKeyboardAwareHeight();

  const drawerOpen = useUiStore((state) => state.drawerOpen);
  const setDrawerOpen = useUiStore((state) => state.setDrawerOpen);

  const mobile = useIsMobile();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0];
    touchStart.current = touch && touch.clientX < EDGE_ZONE_PX && !drawerOpen ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event: TouchEvent): void => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    if (Math.abs(touch.clientY - start.y) > Math.abs(dx)) return;
    if (dx > SWIPE_DISTANCE_PX) setDrawerOpen(true);
  };

  return (
    <div key={locale} className="flex h-[var(--app-height,100dvh)] flex-col overflow-hidden pt-[env(safe-area-inset-top)]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <a
        href="#main-content"
        className="sr-only rounded-sm bg-accent px-3 py-2 text-sm font-medium text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        {t("Skip to conversation")}</a>
      <LaunchMark />
      <OfflineBanner />
      <div className="flex min-h-0 flex-1">
        {mobile ? (
          // On a phone the sidebar is a drawer that follows the finger.
          <Drawer.Root direction="left" open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 z-30 bg-[var(--overlay)]" />
              <Drawer.Content aria-describedby={undefined} onOpenAutoFocus={(event) => event.preventDefault()} className="fixed inset-y-0 left-0 z-30 w-[var(--sidebar-width)] outline-none">
                <Drawer.Title className="sr-only">{t("Conversations")}</Drawer.Title>
                <AppSidebar mobile />
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        ) : (
          <div className="h-full shrink-0 max-md:hidden">
            <AppSidebar />
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          {children}
        </main>
      </div>
      <ProviderWizard />
      <CommandPalette />
      <ConfirmHost />
      <Toaster />
    </div>
  );
}
