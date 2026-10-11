import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { RouteFocus } from "@/components/route-focus";
import { AppShell } from "@/components/shell";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { figtree, geistMono } from "@/fonts/fonts";
import { QueryProvider } from "@/lib/query";

export const metadata: Metadata = {
  description: "ML-assisted WCAG 2.2 auditor for web UI screenshots",
};

const SKIP =
  "sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-2 focus-visible:top-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-surface focus-visible:px-3 focus-visible:py-2 focus-visible:text-body focus-visible:text-ink focus-visible:shadow-float";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${figtree.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <a href="#main" className={SKIP}>
          Skip to content
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryProvider>
            <TooltipProvider>
              <Suspense fallback={null}>
                <RouteFocus />
              </Suspense>
              <Suspense fallback={<div className="min-h-screen" />}>
                <AppShell>{children}</AppShell>
              </Suspense>
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
