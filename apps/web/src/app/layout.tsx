import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/lib/query";

export const metadata: Metadata = {
  title: "WCAG Auditor",
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
              <header className="flex h-12 items-center justify-between border-b px-6">
                <Link
                  href="/"
                  className="inline-flex min-h-6 items-center font-mono text-label"
                >
                  wcag-auditor
                </Link>
                <div className="flex items-center gap-1">
                  <nav aria-label="Main" className="flex gap-1">
                    <Link
                      href="/"
                      className="inline-flex min-h-7 items-center rounded-md px-2.5 text-body hover:bg-muted"
                    >
                      New audit
                    </Link>
                    <Link
                      href="/eval"
                      className="inline-flex min-h-7 items-center rounded-md px-2.5 text-body hover:bg-muted"
                    >
                      Evaluation
                    </Link>
                  </nav>
                  <ThemeToggle />
                </div>
              </header>
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
