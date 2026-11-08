import { SETTINGS_SECTION_IDS } from "@/features/settings/section-ids";

/** A static build writes one page per section, plus /settings itself. */
export function generateStaticParams(): { section: string[] }[] {
  return [{ section: [] }, ...SETTINGS_SECTION_IDS.map((id) => ({ section: [id] }))];
}

/** The layout renders Settings. This route only makes the section URLs valid. */
export default function SettingsPage() {
  return null;
}
