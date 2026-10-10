"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const LINK =
  "inline-flex min-h-7 items-center rounded-md px-2.5 text-body hover:bg-muted";

export function SiteHeader() {
  const pathname = usePathname();
  const participant =
    pathname.startsWith("/study") && pathname !== "/study/admin";
  return (
    <header className="flex h-12 items-center justify-between border-b px-6">
      <Link
        href={participant ? "/study" : "/"}
        className="inline-flex min-h-6 items-center font-mono text-label"
      >
        {participant ? "accessibility report study" : "wcag-auditor"}
      </Link>
      <div className="flex items-center gap-1">
        {participant ? null : (
          <nav aria-label="Main" className="flex gap-1">
            <Link href="/" className={LINK}>
              New audit
            </Link>
            <Link href="/eval" className={LINK}>
              Evaluation
            </Link>
            <Link href="/study/admin" className={LINK}>
              Study admin
            </Link>
          </nav>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
