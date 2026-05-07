import type { Metadata, Viewport } from "next";
import type { ReactElement, ReactNode } from "react";
import { AppShell, TopNav } from "@researchcrafters/ui/components";
import { copy } from "@researchcrafters/ui/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResearchCrafters",
  description:
    "Rebuild the research behind famous AI papers. Practice the decisions, implementations, experiments, and writing that produced them.",
};

export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
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
