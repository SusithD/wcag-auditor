"use client";

import { Search } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Level, ScCode, StatusShape } from "@/components/ds";
import type { ShapeKind } from "@/components/ds/status-shape";
import {
  type Counts,
  type CoverageCell,
  type Finding,
  measureText,
  SC_TITLES,
  SEV_LABEL,
  type SevKey,
  sevKey,
  shortElement,
} from "@/lib/report";
import { cn } from "@/lib/utils";
import {
  BUCKET_ORDER,
  BUCKET_TITLES,
  type Bucket,
  bucketCriteria,
  type GroupBy,
  groupFindings,
  SC_LEVELS,
} from "./logic";
import { Seg } from "./seg";

type Props = {
  findings: Finding[];
  visible: Finding[];
  counts: Record<string, Counts>;
  coverage: CoverageCell[];
  active: string | null;
  selectedKey: string | null;
  query: string;
  groupBy: GroupBy;
  total: number;
  onQuery: (q: string) => void;
  onGroupBy: (by: GroupBy) => void;
  onSelectCriterion: (sc: string | null) => void;
  onSelectFinding: (key: string) => void;
  onEnterCanvas: () => void;
  embedded?: boolean;
};

const ROW =
  "relative grid min-h-[34px] w-full items-center gap-x-2 rounded-md px-2 py-1 text-left text-dense text-ink hover:bg-subtle aria-pressed:bg-tint aria-pressed:shadow-[inset_2px_0_0_var(--accent)]";

function criterionShape(
  bucket: Bucket,
  rows: Finding[],
  sc: string,
): ShapeKind {
  if (bucket === "review") return "review";
  if (bucket === "clear") return "pass";
  if (bucket === "undecided") return "undecided";
  const own = rows.filter((f) => f.sc === sc && f.tier === "automated");
  if (own.some((f) => f.severity === "critical")) return "critical";
  if (own.some((f) => f.severity === "serious")) return "serious";
  return "minor";
}

function findingShape(key: SevKey): ShapeKind {
  return key === "needs-review" ? "review" : key;
}

export function CriteriaRail({
  findings,
  visible,
  counts,
  coverage,
  active,
  selectedKey,
  query,
  groupBy,
  total,
  onQuery,
  onGroupBy,
  onSelectCriterion,
  onSelectFinding,
  onEnterCanvas,
  embedded = false,
}: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [roving, setRoving] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new grouping starts from its own default stop
  useEffect(() => setRoving(null), [groupBy]);
  const buckets = useMemo(
    () => bucketCriteria(findings, coverage),
    [findings, coverage],
  );
  const groups = useMemo(
    () => (groupBy === "criterion" ? [] : groupFindings(visible, groupBy)),
    [visible, groupBy],
  );

  const firstFinding = groups[0]?.findings[0]?.key ?? null;
  const defaultStop =
    groupBy === "criterion"
      ? (active ?? "")
      : groups.some((g) => g.findings.some((f) => f.key === selectedKey))
        ? selectedKey
        : firstFinding;
  const stop = (id: string) => (roving ?? defaultStop) === id;

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>("button[data-nav]") ??
        [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown")
      items[Math.min(items.length - 1, index + 1)]?.focus();
    else if (event.key === "ArrowUp") items[Math.max(0, index - 1)]?.focus();
    else if (event.key === "Enter" && index >= 0 && groupBy === "criterion") {
      const sc = items[index].dataset.sc || null;
      onSelectCriterion(sc === active ? null : sc);
      setTimeout(onEnterCanvas, 0);
    } else return;
    event.preventDefault();
  }

  const countOf = (sc: string) => {
    const c = counts[sc];
    return c ? c.critical + c.serious + c.minor + c["needs-review"] : 0;
  };

  return (
    <nav
      aria-label="Criteria"
      className="flex h-full flex-col overflow-y-auto p-3"
    >
      <h2 className="sr-only">Criteria</h2>
      <div className="mb-1 flex flex-col gap-2">
        <div className="flex min-h-[32px] items-center gap-2 rounded-md border border-line-control bg-surface px-2.5 text-ink-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <label htmlFor="rail-search" className="sr-only">
            Search findings
          </label>
          <input
            id="rail-search"
            type="search"
            placeholder="Search findings"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            className="w-full border-0 bg-transparent text-dense text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <Seg<GroupBy>
          small
          label="Group by"
          value={groupBy}
          onChange={onGroupBy}
          options={[
            { value: "criterion", label: "Criterion" },
            { value: "element", label: "Element" },
            { value: "severity", label: "Severity" },
          ]}
        />
      </div>

      <div ref={list} onKeyDown={onKey}>
        {groupBy === "criterion" ? (
          <>
            <div className="mt-3">
              <button
                type="button"
                data-nav=""
                data-sc=""
                tabIndex={stop("") ? 0 : -1}
                onFocus={() => setRoving("")}
                aria-pressed={active === null}
                onClick={() => onSelectCriterion(null)}
                className={cn(ROW, "grid-cols-[minmax(0,1fr)_auto]")}
              >
                <span>All criteria</span>
                <span className="num text-xs text-ink-2">{total}</span>
              </button>
            </div>
            {BUCKET_ORDER.map((bucket) => (
              <div key={bucket} className="mt-3">
                <div className="flex justify-between px-2 py-1 text-xs">
                  <h3 className="font-semibold text-ink-2">
                    {BUCKET_TITLES[bucket]}
                  </h3>
                  <span className="num font-medium text-ink-3">
                    {buckets[bucket].length}
                  </span>
                </div>
                {buckets[bucket].length === 0 ? (
                  <p className="px-2 pb-1 text-xs text-ink-3">None</p>
                ) : (
                  <ul>
                    {buckets[bucket].map((sc) => {
                      const n = countOf(sc);
                      return (
                        <li key={sc}>
                          <button
                            type="button"
                            data-nav=""
                            data-sc={sc}
                            tabIndex={stop(sc) ? 0 : -1}
                            onFocus={() => setRoving(sc)}
                            aria-pressed={active === sc}
                            onClick={() =>
                              onSelectCriterion(active === sc ? null : sc)
                            }
                            className={cn(
                              ROW,
                              "grid-cols-[14px_40px_minmax(0,1fr)_auto_18px]",
                            )}
                          >
                            <StatusShape
                              kind={criterionShape(bucket, findings, sc)}
                            />
                            <ScCode code={sc} />
                            <span className="leading-[1.125rem]">
                              {SC_TITLES[sc]}
                              {findings.some(
                                (f) => f.sc === sc && f.status === "fixed",
                              ) ? (
                                <span className="block text-xs text-ink-3">
                                  Fix not verified
                                </span>
                              ) : null}
                            </span>
                            <Level level={SC_LEVELS[sc] ?? "AA"} />
                            <span className="num text-right text-xs text-ink-2">
                              {n > 0 ? n : ""}
                              <span className="sr-only">
                                {n > 0 ? " findings" : ""},{" "}
                                {BUCKET_TITLES[bucket]}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </>
        ) : groups.length === 0 ? (
          <p className="mt-3 px-2 text-dense text-ink-3">
            Nothing matches the current filters.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="mt-3">
              <div className="flex justify-between gap-2 px-2 py-1 text-xs">
                <h3
                  className={cn(
                    "min-w-0 truncate font-semibold text-ink-2",
                    g.mono && "font-mono",
                  )}
                  title={g.title}
                >
                  {g.title}
                </h3>
                <span className="num font-medium text-ink-3">
                  {g.findings.length}
                </span>
              </div>
              <ul>
                {g.findings.map((f) => {
                  const key = sevKey(f);
                  return (
                    <li key={f.key}>
                      <button
                        type="button"
                        data-nav=""
                        data-finding={f.key}
                        tabIndex={stop(f.key) ? 0 : -1}
                        onFocus={() => setRoving(f.key)}
                        aria-pressed={f.key === selectedKey}
                        onClick={() => onSelectFinding(f.key)}
                        className={cn(
                          ROW,
                          "grid-cols-[14px_40px_minmax(0,1fr)_auto]",
                        )}
                      >
                        <StatusShape kind={findingShape(key)} />
                        <ScCode code={f.sc} />
                        <span className="min-w-0 truncate leading-[1.125rem]">
                          {groupBy === "element"
                            ? measureText(f) || SC_TITLES[f.sc]
                            : shortElement(f.element, 28)}
                          {f.status === "fixed" ? (
                            <span className="block text-xs text-ink-3">
                              Fix not verified
                            </span>
                          ) : null}
                        </span>
                        <span className="sr-only">
                          {SEV_LABEL[key]}, {SC_TITLES[f.sc]}
                        </span>
                        <Level level={SC_LEVELS[f.sc] ?? "AA"} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
      <p className="mx-2 mt-4 mb-1 text-xs text-ink-3">
        {embedded
          ? "Severity estimates impact on users. Any failure of an A or AA criterion fails conformance."
          : "Severity describes impact on users, not conformance. This tool checks 8 of the 86 WCAG 2.2 success criteria."}
      </p>
    </nav>
  );
}
