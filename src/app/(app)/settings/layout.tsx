import type { Metadata } from "next";
import { SettingsView } from "@/features/settings/settings-view";

export const metadata: Metadata = { title: { absolute: "Settings · NEXA" } };

export default function SettingsLayout() {
  return <SettingsView />;
}
