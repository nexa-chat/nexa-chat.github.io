import type { PresetId } from "./provider";
import type { McpServerConfig } from "./tools";

export type ThemeSetting = "dark" | "light" | "system";
export type EnterBehavior = "send" | "newline";
export type TextSize = "small" | "default" | "large";
export type Palette = "gold" | "emerald" | "violet" | "coral" | "mono";
export type SidebarSize = "compact" | "default" | "large";
/** The interface's language. "auto" follows the browser. */
export type LanguageSetting = "auto" | "en" | "fr";

export interface Settings {
  language: LanguageSetting;
  theme: ThemeSetting;
  palette: Palette;
  textSize: TextSize;
  /** How large the sidebar's rows and icons are. */
  sidebarSize: SidebarSize;
  enterBehavior: EnterBehavior;
  defaultModelId?: string;
  defaultPreset: PresetId;
  defaultSystemPrompt: string;
  autoTitle: boolean;
  autoRetry: boolean;
  showUsage: boolean;
  /** Answers that cost at least this much, in dollars, are highlighted. */
  costHighlightAt: number;
  /** Answers instead when a request fails on the server or the network side. */
  fallbackModelId?: string;
  /** Lets models call tools. Off until the user turns it on. */
  toolsEnabled: boolean;
  /** NEXA's own tools, by id. Missing means on. */
  builtinTools: Record<string, boolean>;
  mcpServers: McpServerConfig[];
  /** Tools that run without asking each time, by their full name. */
  alwaysAllowedTools: string[];
  showLineNumbers: boolean;
  /** Set once the user has accepted that the browser's speech service hears their audio. */
  voiceConsent?: boolean;
  /** Seconds to wait for a first response before giving up. */
  requestTimeoutSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  theme: "dark",
  palette: "gold",
  textSize: "default",
  sidebarSize: "default",
  enterBehavior: "send",
  defaultPreset: "balanced",
  defaultSystemPrompt: "",
  autoTitle: true,
  autoRetry: true,
  showUsage: true,
  costHighlightAt: 0.05,
  toolsEnabled: false,
  builtinTools: {},
  mcpServers: [],
  alwaysAllowedTools: [],
  showLineNumbers: false,
  requestTimeoutSeconds: 120,
};
