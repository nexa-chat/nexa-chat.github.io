import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/features/shell/app-shell";

export const metadata: Metadata = {
  title: { absolute: "NEXA" },
  robots: { index: false },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
