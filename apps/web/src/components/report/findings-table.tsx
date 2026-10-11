"use client";

import {
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ListFilter } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type Finding,
  PROV_GLYPH,
  PROV_LABEL,
  plainValue,
  type ReportState,
  rowLabel,
  SC_LIST,
  SC_TITLES,
  SEV_GLYPH,
  SEV_LABEL,
  SEV_ORDER,
  type SevKey,
  sevKey,
  TIER_LABEL,
} from "@/lib/report";

const ROW = 36;
const HEAD = 36;

type Item =
  | { type: "group"; sc: string; count: number }
  | { type: "row"; finding: Finding };

const COLUMNS: ColumnDef<Finding>[] = [
  { id: "sc", header: "Criterion", accessorFn: (f) => SC_LIST.indexOf(f.sc) },
  {
    id: "severity",
    header: "Severity",
    accessorFn: (f) => SEV_ORDER[sevKey(f)],
  },
  { id: "element", header: "Element", accessorFn: (f) => f.element },
  {
    id: "measured",
    header: "Measured",
    accessorFn: (f) => f.evidence_rows[0]?.value ?? "",
  },
  {
    id: "required",
    header: "Required",
    accessorFn: (f) => f.evidence_rows[1]?.value ?? "",
  },
  { id: "provenance", header: "Provenance", accessorFn: (f) => f.provenance },
  { id: "tier", header: "Tier", accessorFn: (f) => f.tier },
  { id: "score", header: "Score", accessorFn: (f) => f.score },
];

type FacetProps = {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
};

function Facet({ label, options, selected, onChange }: FacetProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={selected.length ? "secondary" : "outline"}
            size="sm"
            className="min-h-[24px] min-w-[24px]"
            aria-label={`Filter by ${label.toLowerCase()}${selected.length ? `, ${selected.length} selected` : ""}`}
          />
        }
      >
        <ListFilter aria-hidden="true" />
        {label}
        {selected.length ? ` (${selected.length})` : ""}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64"
        aria-label={`Filter by ${label.toLowerCase()}`}
      >
        <fieldset>
          <legend className="mb-2 text-body font-medium">{label}</legend>
          <ul className="max-h-64 space-y-0.5 overflow-auto">
            {options.map((o) => (
              <li key={o.value}>
                <label className="flex min-h-[24px] cursor-pointer items-center gap-2 text-body">
                  <input
                    type="checkbox"
                    className="size-[24px] shrink-0"
                    checked={selected.includes(o.value)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...selected, o.value]
                          : selected.filter((v) => v !== o.value),
                      )
                    }
                  />
                  {o.label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

type Props = {
  findings: Finding[];
  state: ReportState;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onFilter: (patch: Partial<ReportState>) => void;
};

export function FindingsTable({
  findings,
  state,
  selectedKey,
  onSelect,
  onFilter,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "severity", desc: false },
  ]);
  const scroller = useRef<HTMLDivElement>(null);
  const table = useReactTable({
    data: findings,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
  });

  const sortedRows = table.getRowModel().rows;
  const items = useMemo<Item[]>(() => {
    const sorted = sortedRows.map((r) => r.original);
    const out: Item[] = [];
    for (const sc of SC_LIST) {
      const rows = sorted.filter((f) => f.sc === sc);
      if (rows.length === 0) continue;
      out.push({ type: "group", sc, count: rows.length });
      for (const finding of rows) out.push({ type: "row", finding });
    }
    return out;
  }, [sortedRows]);

  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 10,
    initialRect: { width: 800, height: 600 },
  });
  const selectedIndex = items.findIndex(
    (i) => i.type === "row" && i.finding.key === selectedKey,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll only when the selection moves
  useEffect(() => {
    if (selectedIndex >= 0)
      virtual.scrollToIndex(selectedIndex, { align: "auto" });
  }, [selectedIndex]);
  const rows = virtual.getVirtualItems();
  const padTop = rows.length ? rows[0].start : 0;
  const padBottom = rows.length
    ? virtual.getTotalSize() - rows[rows.length - 1].end
    : 0;
  const header = table.getHeaderGroups()[0].headers;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Facet
          label="Severity"
          options={(Object.keys(SEV_LABEL) as SevKey[]).map((k) => ({
            value: k,
            label: `${SEV_GLYPH[k]} ${SEV_LABEL[k]}`,
          }))}
          selected={state.sev}
          onChange={(sev) => onFilter({ sev: sev as SevKey[] })}
        />
        <Facet
          label="Provenance"
          options={(["rule", "pixel", "both"] as const).map((k) => ({
            value: k,
            label: `${PROV_GLYPH[k]} ${PROV_LABEL[k]}`,
          }))}
          selected={state.prov}
          onChange={(prov) => onFilter({ prov })}
        />
        <Facet
          label="Tier"
          options={Object.entries(TIER_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
          selected={state.tier}
          onChange={(tier) => onFilter({ tier })}
        />
        <Facet
          label="Criterion"
          options={SC_LIST.map((sc) => ({
            value: sc,
            label: `${sc} ${SC_TITLES[sc]}`,
          }))}
          selected={state.sc}
          onChange={(sc) => onFilter({ sc })}
        />
        <span className="ml-auto text-caption text-muted-foreground">
          {findings.length} findings
        </span>
      </div>
      <div
        ref={scroller}
        id="findings-table"
        tabIndex={0}
        role="region"
        aria-label="Findings table"
        className="min-h-0 flex-1 overflow-auto"
        style={{ scrollPaddingTop: HEAD * 2 }}
      >
        <table
          className="w-full border-collapse text-row"
          aria-rowcount={items.length + 1}
        >
          <thead className="sticky top-0 z-10 bg-background">
            <tr aria-rowindex={1} style={{ height: HEAD }}>
              {header.map((h) => {
                const sort = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={
                      sort === "asc"
                        ? "ascending"
                        : sort === "desc"
                          ? "descending"
                          : "none"
                    }
                    className="border-b px-3 text-left text-caption font-medium text-muted-foreground"
                  >
                    <button
                      type="button"
                      className="inline-flex min-h-[24px] min-w-[24px] items-center gap-1"
                      aria-label={`Sort by ${String(h.column.columnDef.header).toLowerCase()}${sort === "asc" ? ", sorted ascending" : sort === "desc" ? ", sorted descending" : ""}`}
                      onClick={() => h.column.toggleSorting(sort === "asc")}
                    >
                      {String(h.column.columnDef.header)}
                      {sort === "asc" ? (
                        <ArrowUp aria-hidden="true" className="size-3" />
                      ) : null}
                      {sort === "desc" ? (
                        <ArrowDown aria-hidden="true" className="size-3" />
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 ? (
              // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: spacer row of the virtual window
              <tr role="presentation" style={{ height: padTop }}>
                <td colSpan={COLUMNS.length} />
              </tr>
            ) : null}
            {rows.map((vr) => {
              const item = items[vr.index];
              if (item.type === "group") {
                return (
                  <tr
                    key={`g-${item.sc}`}
                    aria-rowindex={vr.index + 2}
                    style={{ height: ROW }}
                    className="bg-muted"
                  >
                    <th
                      scope="rowgroup"
                      colSpan={COLUMNS.length}
                      className="sticky z-[5] bg-muted px-3 text-left text-caption font-semibold"
                      style={{ top: HEAD }}
                    >
                      <span className="font-mono">{item.sc}</span>{" "}
                      {SC_TITLES[item.sc]} ({item.count})
                    </th>
                  </tr>
                );
              }
              const f = item.finding;
              const k = sevKey(f);
              const isSel = f.key === selectedKey;
              return (
                <tr
                  key={f.key}
                  aria-rowindex={vr.index + 2}
                  data-selected={isSel}
                  data-key={f.key}
                  style={{ height: ROW }}
                  onClick={() => onSelect(f.key)}
                  className="cursor-pointer border-b hover:bg-muted/60 data-[selected=true]:bg-muted"
                >
                  <td className="px-3">
                    <button
                      type="button"
                      className="inline-flex min-h-[24px] min-w-[24px] items-center font-mono text-label underline underline-offset-4"
                      aria-label={rowLabel(f)}
                      data-row-key={f.key}
                      aria-pressed={isSel}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(f.key);
                      }}
                    >
                      {f.sc}
                    </button>
                  </td>
                  <td className="px-3">
                    <span
                      className={`inline-flex items-center gap-1 text-sev-${k === "needs-review" ? "review" : k}`}
                    >
                      <span aria-hidden="true">{SEV_GLYPH[k]}</span>
                      {SEV_LABEL[k]}
                    </span>
                  </td>
                  <td
                    className="max-w-56 truncate px-3 font-mono text-label"
                    title={f.element}
                  >
                    {f.element}
                  </td>
                  <td className="px-3 font-mono text-label">
                    {plainValue(f.evidence_rows[0]?.value ?? "—")}
                  </td>
                  <td className="px-3 font-mono text-label">
                    {plainValue(f.evidence_rows[1]?.value ?? "—")}
                  </td>
                  <td className="px-3">
                    <span aria-hidden="true">{PROV_GLYPH[f.provenance]}</span>{" "}
                    {PROV_LABEL[f.provenance]}
                  </td>
                  <td className="px-3">{TIER_LABEL[f.tier]}</td>
                  <td className="px-3 font-mono text-label">
                    {f.score.toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {padBottom > 0 ? (
              // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: spacer row of the virtual window
              <tr role="presentation" style={{ height: padBottom }}>
                <td colSpan={COLUMNS.length} />
              </tr>
            ) : null}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="p-4 text-body text-muted-foreground">
            No findings match the current filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
