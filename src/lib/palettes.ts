import type { Palette } from "@/types";

export interface PaletteInfo {
  id: Palette;
  label: string;
  /** Shown as the swatch. */
  accent: string;
  /** Browser chrome colours, which can't read CSS variables. */
  dark: string;
  light: string;
}

export const PALETTES: readonly PaletteInfo[] = [
  { id: "gold", label: "Gold", accent: "#eebb5e", dark: "#141210", light: "#fbfaf7" },
  { id: "emerald", label: "Emerald", accent: "#52daa1", dark: "#0e1411", light: "#f6fcf9" },
  { id: "violet", label: "Violet", accent: "#b7a0fb", dark: "#131119", light: "#faf9ff" },
  { id: "coral", label: "Coral", accent: "#fa897b", dark: "#171110", light: "#fef9f8" },
  { id: "mono", label: "Mono", accent: "#eeeeee", dark: "#131313", light: "#fafafa" },
];

/** The app mark on the palette's ground, as an SVG data URL for the browser tab. */
export function paletteIcon(palette: Palette): string {
  const info = PALETTES.find((item) => item.id === palette) ?? PALETTES[0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${info?.dark}"/><g fill="none" stroke="${info?.accent}" stroke-width="3.2"><path d="M9 26V12.5"/><path d="M23 6v13.5"/><path d="M9 12.5l14 7"/></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function themeColor(palette: Palette, theme: "dark" | "light"): string {
  const info = PALETTES.find((item) => item.id === palette) ?? PALETTES[0];
  return info ? info[theme] : "#141210";
}
