"use client";

import { create } from "zustand";
import { paletteIcon, themeColor } from "@/lib/palettes";
import { getStorage } from "@/storage";
import { DEFAULT_SETTINGS, type Settings, type ThemeSetting } from "@/types";

const SETTINGS_ID = "app";
/** Read by the inline script in the root layout, so the first paint has the right theme. */
export const THEME_STORAGE_KEY = "nexa-theme";
export const TEXT_SIZE_STORAGE_KEY = "nexa-text-size";
export const PALETTE_STORAGE_KEY = "nexa-palette";

export function resolveTheme(theme: ThemeSetting): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyAppearance(settings: Settings): void {
  const root = document.documentElement;
  const theme = resolveTheme(settings.theme);
  root.dataset.theme = theme;
  root.dataset.textSize = settings.textSize;
  root.dataset.palette = settings.palette;
  // The phone's status bar follows this, and it can't read CSS variables.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = themeColor(settings.palette, theme);
  }
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]')) {
    link.href = paletteIcon(settings.palette);
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, settings.theme);
    localStorage.setItem(TEXT_SIZE_STORAGE_KEY, settings.textSize);
    localStorage.setItem(PALETTE_STORAGE_KEY, settings.palette);
  } catch {
    // Storage can be blocked. Appearance still applies for this session.
  }
}

interface SettingsState {
  settings: Settings;
  /** False until the stored settings are read, so the first render matches the server's. */
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const record = await getStorage().get("settings", SETTINGS_ID);
    const settings = { ...DEFAULT_SETTINGS, ...(record?.value as Partial<Settings> | undefined) };
    set({ settings, loaded: true });
    applyAppearance(settings);
  },

  update: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    applyAppearance(settings);
    void getStorage().put("settings", { id: SETTINGS_ID, value: settings });
  },
}));
