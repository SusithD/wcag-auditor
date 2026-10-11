"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  ChartLine,
  CircleHelp,
  Eye,
  Globe,
  LayoutDashboard,
  List,
  type LucideIcon,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/ds";
import { useShellRuns } from "@/hooks/use-shell-data";
import {
  filterPalette,
  type PaletteItem,
  runLabel,
  stepIndex,
} from "@/lib/shell";
import { age } from "@/lib/url";

type Command = PaletteItem & { icon: LucideIcon; run: () => void };

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const runs = useShellRuns();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const base = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const dark = resolvedTheme === "dark";
    const nav = (
      id: string,
      label: string,
      href: string,
      icon: LucideIcon,
    ): Command => ({ id, group: "Go to", label, icon, run: go(href) });
    const recent: Command[] = (runs.data ?? []).slice(0, 5).map((run) => ({
      id: `run-${run.id}`,
      group: "Recent audits",
      label: runLabel(run),
      hint: `${run.status} ${age(run.created_at)}`,
      icon: Globe,
      run: go(`/runs/${run.id}`),
    }));
    return [
      {
        id: "new",
        group: "Actions",
        label: "New audit",
        icon: Plus,
        run: go("/audit/new"),
      },
      nav("overview", "Overview", "/", LayoutDashboard),
      nav("audits", "Audits", "/audits", List),
      nav("review", "Review queue", "/review", Eye),
      nav("sites", "Sites", "/sites", Globe),
      nav("eval", "Evaluation", "/eval", ChartLine),
      nav("study", "Study", "/study/admin", Users),
      nav("settings", "Settings", "/settings", Settings),
      nav("help", "Help and method", "/help", CircleHelp),
      ...recent,
      {
        id: "theme",
        group: "Appearance",
        label: dark ? "Use light theme" : "Use dark theme",
        icon: dark ? Sun : Moon,
        run: () => setTheme(dark ? "light" : "dark"),
      },
    ];
  }, [router, resolvedTheme, setTheme, runs.data]);

  const results = useMemo(
    () => filterPalette(commands, query),
    [commands, query],
  );
  const groups = useMemo(() => {
    const order: string[] = [];
    for (const item of results)
      if (!order.includes(item.group)) order.push(item.group);
    return order.map((name) => ({
      name,
      items: results.filter((i) => i.group === name),
    }));
  }, [results]);

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const activeId = results[activeIndex]
    ? `${base}-opt-${results[activeIndex].id}`
    : undefined;

  useEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId]);

  const choose = (item: Command | undefined) => {
    if (!item) return;
    onOpenChange(false);
    item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        stepIndex(
          activeIndex,
          event.key === "ArrowDown" ? 1 : -1,
          results.length,
        ),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(results.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[activeIndex] as Command | undefined);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setActive(0);
        }
      }}
      modal
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          data-slot="command-palette"
          initialFocus={inputRef}
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg bg-surface text-ink shadow-float outline-none transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Dialog.Description className="sr-only">
            Type to find a page, a recent audit or a command. Use the arrow keys
            to move and Enter to choose.
          </Dialog.Description>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search
              className="size-4 shrink-0 text-ink-3"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={results.length > 0 ? `${base}-list` : undefined}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label="Search pages, audits and commands"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search pages, audits and commands"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-12 min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
            />
            <Kbd>Esc</Kbd>
          </div>
          {results.length > 0 ? (
            <div
              id={`${base}-list`}
              role="listbox"
              aria-label="Results"
              className="min-h-0 flex-1 overflow-y-auto p-2"
            >
              {groups.map((group, groupIndex) => (
                // biome-ignore lint/a11y/useSemanticElements: listbox groups need role=group
                <div
                  key={group.name}
                  role="group"
                  aria-labelledby={`${base}-g-${groupIndex}`}
                >
                  <div
                    id={`${base}-g-${groupIndex}`}
                    className="px-2 pt-2 pb-1 text-xs font-medium text-ink-3"
                  >
                    {group.name}
                  </div>
                  {group.items.map((item) => {
                    const isActive = results[activeIndex]?.id === item.id;
                    const Icon = (item as Command).icon;
                    return (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection runs on the combobox input
                      <div
                        key={item.id}
                        id={`${base}-opt-${item.id}`}
                        role="option"
                        aria-selected={isActive}
                        tabIndex={-1}
                        onMouseMove={() =>
                          setActive(results.findIndex((r) => r.id === item.id))
                        }
                        onClick={() => choose(item as Command)}
                        className="flex min-h-[36px] cursor-default items-center gap-3 rounded-md px-2 text-body text-ink-2 aria-selected:bg-tint aria-selected:text-ink"
                      >
                        <Icon
                          className="size-4 shrink-0"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {item.hint ? (
                          <span className="text-xs text-ink-3">
                            {item.hint}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
          <output className="sr-only">
            {results.length === 0
              ? "No results"
              : `${results.length} ${results.length === 1 ? "result" : "results"}`}
          </output>
          {results.length === 0 ? (
            <p
              className="px-4 pb-6 text-center text-body text-ink-2"
              aria-hidden="true"
            >
              Nothing matches that search.
            </p>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
