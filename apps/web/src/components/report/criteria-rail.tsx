"use client";

import { type KeyboardEvent, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  type Counts,
  type CoverageCell,
  PROV_GLYPH,
  PROV_LABEL,
  SC_LIST,
  SC_TITLES,
  verdictProvenance,
} from "@/lib/report";

type Props = {
  counts: Record<string, Counts>;
  coverage: CoverageCell[];
  active: string | null;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (sc: string | null) => void;
  onEnterCanvas: () => void;
  total: number;
};

export function CriteriaRail({
  counts,
  coverage,
  active,
  query,
  onQuery,
  onSelect,
  onEnterCanvas,
  total,
}: Props) {
  const list = useRef<HTMLUListElement>(null);
  const verdicts = Object.fromEntries(coverage.map((c) => [c.sc, c]));
  const automated = (ch: "rule" | "pixel" | "hybrid") =>
    coverage.filter((c) => c[`${ch}_verdict`] === "automated").length;

  function onKey(event: KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>("button[data-sc]") ??
        [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown")
      items[Math.min(items.length - 1, index + 1)]?.focus();
    else if (event.key === "ArrowUp") items[Math.max(0, index - 1)]?.focus();
    else if (event.key === "Enter" && index >= 0) {
      const sc = items[index].dataset.sc || null;
      onSelect(sc === active ? null : sc);
      setTimeout(onEnterCanvas, 0);
    } else return;
    event.preventDefault();
  }

  return (
    <nav
      aria-label="Criteria"
      className="flex h-full flex-col gap-3 overflow-y-auto p-3"
    >
      <div>
        <label htmlFor="rail-search" className="sr-only">
          Search findings
        </label>
        <Input
          id="rail-search"
          type="search"
          placeholder="Search findings"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <section
        aria-labelledby="summary-h"
        className="rounded-lg border bg-card p-3"
      >
        <h2
          id="summary-h"
          className="text-label font-medium uppercase tracking-wide text-muted-foreground"
        >
          Summary
        </h2>
        <p className="mt-1 text-row font-semibold">{total} findings</p>
        <p className="mt-1 text-caption text-muted-foreground">
          Automated verdicts of 8: rule {automated("rule")}, pixel{" "}
          {automated("pixel")}, hybrid {automated("hybrid")}
        </p>
      </section>
      <ul ref={list} onKeyDown={onKey} className="space-y-0.5">
        <li>
          <button
            type="button"
            data-sc=""
            aria-current={active === null ? "page" : undefined}
            onClick={() => onSelect(null)}
            className="relative flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1 aria-[current=page]:before:left-0 aria-[current=page]:before:w-0.5 aria-[current=page]:before:bg-accent-focus"
          >
            All criteria
          </button>
        </li>
        {SC_LIST.map((sc) => {
          const c = counts[sc] ?? {
            critical: 0,
            serious: 0,
            minor: 0,
            "needs-review": 0,
          };
          const prov = verdictProvenance(verdicts[sc]);
          return (
            <li key={sc}>
              <button
                type="button"
                data-sc={sc}
                aria-current={active === sc ? "page" : undefined}
                onClick={() => onSelect(active === sc ? null : sc)}
                className="relative grid min-h-9 w-full grid-cols-[auto_1fr_auto] items-center gap-x-2 rounded-md px-2 py-1 text-left text-body hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1 aria-[current=page]:before:left-0 aria-[current=page]:before:w-0.5 aria-[current=page]:before:bg-accent-focus"
              >
                <span className="font-mono text-label">{sc}</span>
                <span className="truncate">{SC_TITLES[sc]}</span>
                <span className="flex items-center gap-2 font-mono text-label">
                  <span className="sr-only">
                    {c.critical} critical, {c.serious} serious, {c.minor} minor
                    {c["needs-review"]
                      ? `, ${c["needs-review"]} needs review`
                      : ""}
                    ; verdict {PROV_LABEL[prov]}
                  </span>
                  <span aria-hidden="true" className="text-sev-critical">
                    ● {c.critical}
                  </span>
                  <span aria-hidden="true" className="text-sev-serious">
                    ▲ {c.serious}
                  </span>
                  <span aria-hidden="true" className="text-sev-minor">
                    ■ {c.minor}
                  </span>
                  <span aria-hidden="true" title={PROV_LABEL[prov]}>
                    {PROV_GLYPH[prov]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-muted-foreground">
        Verdict: ◐ rule · ◑ pixel · ● both · ○ none
      </p>
    </nav>
  );
}
