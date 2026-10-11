"use client";

import { ChevronRight, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useSyncExternalStore } from "react";
import { Kbd } from "@/components/ds";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { defaultCrumbs } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { useShell } from "./shell-context";

const noopSubscribe = () => () => {};

function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const { crumbs } = useShell();
  const items = crumbs ?? defaultCrumbs(pathname);
  if (items.length === 0) return <div className="flex-1" />;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
      <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 overflow-hidden p-0 text-dense text-ink-3">
        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? (
                <li aria-hidden="true" className="flex shrink-0">
                  <ChevronRight className="size-3.5" strokeWidth={1.5} />
                </li>
              ) : null}
              <li className={cn("min-w-0", index === 0 && !last && "shrink-0")}>
                {last ? (
                  <span
                    aria-current="page"
                    className="block truncate font-medium text-ink"
                  >
                    {crumb.label}
                  </span>
                ) : crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="block min-h-[24px] truncate leading-6 text-ink-3 no-underline hover:text-ink"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="block truncate">{crumb.label}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

export function TopBar({
  menuOpen,
  onOpenMenu,
  onOpenSearch,
}: {
  menuOpen: boolean;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) {
  const { setActionsEl } = useShell();
  const mac = useIsMac();
  return (
    <header className="sticky top-0 z-10 flex h-[56px] flex-none items-center gap-3 border-b border-line bg-surface px-6 max-[720px]:px-4">
      <div className="hidden items-center gap-2 max-[720px]:flex">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={onOpenMenu}
        >
          <Menu strokeWidth={1.5} aria-hidden="true" />
        </Button>
        <BrandMark />
      </div>
      <Breadcrumbs />
      <div
        ref={setActionsEl}
        className="flex shrink-0 items-center gap-2 empty:hidden"
      />
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label="Search"
        onClick={onOpenSearch}
        className="flex h-[32px] w-[320px] shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line bg-canvas pr-2 pl-2.5 text-left text-dense text-ink-3 transition-colors duration-hover hover:bg-subtle max-[1100px]:w-[220px] max-[720px]:w-[32px] max-[720px]:justify-center max-[720px]:p-0"
      >
        <Search
          className="size-4 shrink-0"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="max-[720px]:hidden">Search</span>
        <span
          aria-hidden="true"
          className="ml-auto inline-flex gap-0.5 max-[720px]:hidden"
        >
          <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <ThemeToggle />
    </header>
  );
}
