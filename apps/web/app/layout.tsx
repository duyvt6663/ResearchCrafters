import type { Metadata, Viewport } from "next";
import type { ReactElement, ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell, TopNav } from "@researchcrafters/ui/components";
import { copy } from "@researchcrafters/ui/copy";
import "./globals.css";

/**
 * Display + UI font: Inter (variable). Loaded via `next/font/google` so the
 * font binary is fingerprinted and self-hosted — no FOUT and no third-party
 * runtime fetch from `fonts.gstatic.com`. We also load JetBrains Mono for
 * code/CLI surfaces.
 *
 * The CSS variables (`--rc-font-sans-runtime`, `--rc-font-mono-runtime`) are
 * the runtime hooks the UI tokens fall back through — `--font-rc-sans` first
 * tries the runtime variable, then drops to its system stack default.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--rc-font-sans-runtime",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--rc-font-mono-runtime",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ResearchCrafters",
  description:
    "Rebuild the research behind famous AI papers. Practice the decisions, implementations, experiments, and writing that produced them.",
};

export const viewport: Viewport = {
  themeColor: "#1B2433",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AppShell
          topNav={
            <TopNav
              brand={copy.brand.name}
              links={[
                { href: "/", label: copy.nav.catalog },
                { href: "/enrollments", label: copy.nav.myPackages },
              ]}
            />
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
