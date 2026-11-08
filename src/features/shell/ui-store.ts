"use client";

import { create } from "zustand";

export type SidebarSort = "recent" | "name";
export type PaletteMode = "search" | "actions";

interface WizardState {
  open: boolean;
  /** Set when editing an existing provider. */
  providerId?: string;
}

interface UiState {
  sidebarOpen: boolean;
  /** Dragged width in px. Unset means the theme's default. */
  sidebarWidth?: number;
  drawerOpen: boolean;
  sidebarSort: SidebarSort;
  showArchived: boolean;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  wizard: WizardState;
  instructionsOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number | undefined) => void;
  toggleSidebar: () => void;
  setDrawerOpen: (open: boolean) => void;
  setSidebarSort: (sort: SidebarSort) => void;
  setShowArchived: (show: boolean) => void;
  openPalette: (mode: PaletteMode) => void;
  closePalette: () => void;
  openWizard: (providerId?: string) => void;
  closeWizard: () => void;
  setInstructionsOpen: (open: boolean) => void;
}

const SIDEBAR_KEY = "nexa-sidebar";
const SORT_KEY = "nexa-sidebar-sort";
const WIDTH_KEY = "nexa-sidebar-width";

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A convenience only. It can fail in a private window.
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: true,
  drawerOpen: false,
  sidebarSort: "recent",
  showArchived: false,
  paletteOpen: false,
  paletteMode: "search",
  wizard: { open: false },
  instructionsOpen: false,

  setSidebarOpen: (sidebarOpen) => {
    set({ sidebarOpen });
    remember(SIDEBAR_KEY, String(sidebarOpen));
  },
  setSidebarWidth: (sidebarWidth) => {
    set({ sidebarWidth });
    try {
      if (sidebarWidth === undefined) localStorage.removeItem(WIDTH_KEY);
      else localStorage.setItem(WIDTH_KEY, String(sidebarWidth));
    } catch {
      // A convenience only.
    }
  },
  toggleSidebar: () => {
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (mobile) set({ drawerOpen: !get().drawerOpen });
    else get().setSidebarOpen(!get().sidebarOpen);
  },
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSidebarSort: (sidebarSort) => {
    set({ sidebarSort });
    remember(SORT_KEY, sidebarSort);
  },
  setShowArchived: (showArchived) => set({ showArchived }),
  openPalette: (paletteMode) => set({ paletteOpen: true, paletteMode }),
  closePalette: () => set({ paletteOpen: false }),
  openWizard: (providerId) => set({ wizard: { open: true, providerId } }),
  closeWizard: () => set({ wizard: { open: false } }),
  setInstructionsOpen: (instructionsOpen) => set({ instructionsOpen }),
}));

export function restoreUiPreferences(): void {
  try {
    const sidebar = localStorage.getItem(SIDEBAR_KEY);
    const sort = localStorage.getItem(SORT_KEY);
    const width = Number(localStorage.getItem(WIDTH_KEY));
    useUiStore.setState({
      ...(width >= 200 && width <= 480 ? { sidebarWidth: width } : {}),
      ...(sidebar === null ? {} : { sidebarOpen: sidebar === "true" }),
      ...(sort === "name" || sort === "recent" ? { sidebarSort: sort } : {}),
    });
  } catch {
    // Defaults apply.
  }
}
