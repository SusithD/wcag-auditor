import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { RouteFocus } from "@/components/route-focus";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/lib/query";

export const metadata: Metadata = {
  description: "ML-assisted WCAG 2.2 auditor for web UI screenshots",
};

const SKIP =
  "sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-2 focus-visible:top-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-3 focus-visible:py-2 focus-visible:text-body";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a href="#main" className={SKIP}>
          Skip to content
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryProvider>
            <TooltipProvider>
              <Suspense fallback={<header className="h-12 border-b" />}>
                <SiteHeader />
              </Suspense>
              <Suspense fallback={null}>
                <RouteFocus />
              </Suspense>
              <main id="main" tabIndex={-1} className="flex-1 outline-none">
                {children}
              </main>
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
