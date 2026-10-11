"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { isParticipantRoute } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { ShellProvider, useShell } from "./shell-context";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

function FocusedShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[56px] flex-none items-center justify-between border-b border-line bg-surface px-6 max-[720px]:px-4">
        <Link
          href="/study"
          className="inline-flex min-h-[32px] items-center font-mono text-xs text-ink no-underline"
        >
          accessibility report study
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
    </div>
  );
}

function FullShell({ children }: { children: ReactNode }) {
  const { wide } = useShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 720px)");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] max-[1100px]:grid-cols-[64px_minmax(0,1fr)] max-[720px]:grid-cols-[minmax(0,1fr)]">
      <aside
        aria-label="Sidebar"
        className="sticky top-0 h-screen self-start border-r border-line bg-surface max-[720px]:hidden"
      >
        <Sidebar mode="side" />
      </aside>
      <div className="flex min-w-0 flex-col">
        <TopBar
          menuOpen={menuOpen && mobile}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "w-full flex-1 p-6 outline-none max-[720px]:p-4",
            !wide && "max-w-[1360px]",
          )}
        >
          {children}
        </main>
      </div>
      <Sheet open={menuOpen && mobile} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="w-[280px] max-w-[85vw] gap-0 p-0 sm:max-w-[280px]"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar mode="drawer" onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isParticipantRoute(pathname))
    return <FocusedShell>{children}</FocusedShell>;
  return (
    <ShellProvider>
      <FullShell>{children}</FullShell>
    </ShellProvider>
  );
}
