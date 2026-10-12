"use client";

import {
  ChartLine,
  CircleHelp,
  Eye,
  Globe,
  LayoutDashboard,
  List,
  type LucideIcon,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useReviewWaiting, useShellRuns } from "@/hooks/use-shell-data";
import {
  FOOTER_NAV,
  type NavEntry,
  PRIMARY_NAV,
  RESEARCH_NAV,
  recentSites,
} from "@/lib/shell";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { UserMenu } from "./user-menu";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  audits: List,
  review: Eye,
  sites: Globe,
  eval: ChartLine,
  study: Users,
  settings: Settings,
  help: CircleHelp,
};

export type SidebarMode = "side" | "drawer";

const ITEM =
  "relative flex min-h-[32px] items-center gap-3 rounded-md px-2 font-medium text-ink-2 no-underline transition-colors duration-hover hover:bg-subtle hover:text-ink aria-[current=page]:bg-tint aria-[current=page]:text-ink aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2 aria-[current=page]:before:left-0 aria-[current=page]:before:w-0.5 aria-[current=page]:before:rounded-r-sm aria-[current=page]:before:bg-accent";

function NavItem({
  entry,
  pathname,
  mode,
  rail,
  count,
  onNavigate,
}: {
  entry: NavEntry;
  pathname: string;
  mode: SidebarMode;
  rail: boolean;
  count?: number | null;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[entry.key];
  const current = entry.match(pathname);
  const side = mode === "side";
  const link = (
    <Link
      href={entry.href}
      data-nav-item=""
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
      className={cn(ITEM, side && "max-[1100px]:justify-center")}
    />
  );
  const body = (
    <>
      <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className={cn(side && "max-[1100px]:sr-only")}>{entry.label}</span>
      {typeof count === "number" ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "num ml-auto text-xs font-normal text-ink-3",
              side && "max-[1100px]:hidden",
            )}
          >
            {count}
          </span>
          <span className="sr-only">, {count} waiting</span>
        </>
      ) : null}
    </>
  );
  return (
    <Tooltip disabled={!rail}>
      <TooltipTrigger render={link}>{body}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {entry.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({
  mode = "side",
  onNavigate,
}: {
  mode?: SidebarMode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const side = mode === "side";
  const narrow = useMediaQuery("(max-width: 1100px)");
  const rail = side && narrow;
  const waiting = useReviewWaiting();
  const runs = useShellRuns();
  const recents = recentSites(runs.data ?? [], 3);
  const itemProps = { pathname, mode, rail, onNavigate };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-[56px] flex-none items-center border-b border-line px-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex min-h-[32px] items-center gap-2.5 rounded-md text-[0.9375rem] font-semibold text-ink no-underline"
        >
          <BrandMark />
          <span className={cn(side && "max-[1100px]:sr-only")}>
            WCAG Auditor
          </span>
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <Tooltip disabled={!rail}>
          <TooltipTrigger
            render={
              <Link
                href="/audit/new"
                onClick={onNavigate}
                className={cn(
                  buttonVariants({ variant: "primary" }),
                  "w-full no-underline",
                  side && "max-[1100px]:px-0",
                )}
              />
            }
          >
            <Plus className="size-4" strokeWidth={2} aria-hidden="true" />
            <span className={cn(side && "max-[1100px]:sr-only")}>
              New audit
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            New audit
          </TooltipContent>
        </Tooltip>

        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((entry) => (
            <NavItem
              key={entry.key}
              entry={entry}
              count={entry.key === "review" ? waiting : undefined}
              {...itemProps}
            />
          ))}
          <div
            aria-hidden="true"
            className={cn(
              "px-2 pt-3 pb-1 text-xs font-medium text-ink-3",
              side &&
                "max-[1100px]:mx-2 max-[1100px]:my-2 max-[1100px]:h-px max-[1100px]:overflow-hidden max-[1100px]:bg-line max-[1100px]:p-0 max-[1100px]:text-[0px]",
            )}
          >
            Research
          </div>
          {RESEARCH_NAV.map((entry) => (
            <NavItem key={entry.key} entry={entry} {...itemProps} />
          ))}
        </nav>

        {recents.length > 0 ? (
          <nav
            aria-label="Recent sites"
            className={cn(
              "flex flex-col gap-0.5",
              side && "max-[1100px]:hidden",
            )}
          >
            <div className="px-2 pt-3 pb-1 text-xs font-medium text-ink-3">
              Recent sites
            </div>
            {recents.map((site) => (
              <Link
                key={site.host}
                href={`/runs/${site.runId}`}
                onClick={onNavigate}
                className={ITEM}
                title={site.host}
              >
                <span
                  aria-hidden="true"
                  className="grid size-4 shrink-0 place-items-center rounded-sm border border-line bg-subtle text-[0.5625rem] font-semibold text-ink-2"
                >
                  {site.host[0]?.toUpperCase()}
                </span>
                <span className="truncate">{site.host}</span>
              </Link>
            ))}
          </nav>
        ) : null}

        <nav
          aria-label="Settings and help"
          className="mt-auto flex flex-col gap-0.5"
        >
          {FOOTER_NAV.map((entry) => (
            <NavItem key={entry.key} entry={entry} {...itemProps} />
          ))}
        </nav>
      </div>
      <UserMenu side={side} />
    </div>
  );
}
