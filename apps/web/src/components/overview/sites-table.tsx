"use client";

import { Monitor, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { components } from "@/api/types";
import {
  Meter,
  Panel,
  PanelHeader,
  QuietLink,
  SeverityCounts,
  Status,
} from "@/components/ds";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  changeText,
  filterSites,
  isActive,
  runStatusView,
  type SiteFilter,
  siteParts,
  viewportWords,
} from "@/lib/overview";
import { age } from "@/lib/url";

type Site = components["schemas"]["SiteRow"];

const FILTERS: { value: SiteFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "failures", label: "With failures" },
  { value: "running", label: "Running" },
];

const TD =
  "px-3 py-3 align-middle first:pl-4 last:pr-4 @max-[760px]:block @max-[760px]:px-4 @max-[760px]:py-1";

function SiteCell({ row }: { row: Site }) {
  const { host, path } = siteParts(row.latest_run);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center rounded-sm bg-subtle text-xs font-medium text-ink-2"
      >
        {host.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <Link
          href={`/runs/${row.latest_run.id}`}
          className="block truncate font-medium text-ink underline-offset-4 hover:underline"
        >
          {host}
        </Link>
        <small className="flex items-center gap-2 text-label text-ink-3">
          {path ? <span className="truncate">{path}</span> : null}
          <span aria-hidden="true" className="inline-flex gap-1">
            {row.latest_run.viewports.map((vp) =>
              vp === "desktop" ? (
                <Monitor key={vp} className="size-3.5" />
              ) : (
                <Smartphone key={vp} className="size-3.5" />
              ),
            )}
          </span>
          <span className="sr-only">
            {viewportWords(row.latest_run.viewports)}
          </span>
        </small>
      </div>
    </div>
  );
}

function Row({ row }: { row: Site }) {
  const run = row.latest_run;
  const finished = run.status === "done" || run.status === "partial";
  const status = runStatusView(run.status, run.error);
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-subtle @max-[760px]:block @max-[760px]:py-2">
      <td className={`${TD} @min-[761px]:max-w-0`}>
        <SiteCell row={row} />
      </td>
      <td className={TD}>
        {finished ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3">
              <span className="num font-semibold">{row.failures}</span>
              <SeverityCounts
                critical={run.counts.critical}
                serious={run.counts.serious}
                minor={run.counts.minor}
              />
            </div>
            <div className="text-label text-ink-3">
              {changeText(row.failures_delta, row.previous_run_id !== null)}
            </div>
          </>
        ) : (
          <span className="text-ink-3">
            {isActive(run.status)
              ? "No report yet"
              : "No report: the audit did not finish"}
          </span>
        )}
      </td>
      <td className={`${TD} text-right @max-[760px]:text-left`}>
        {finished ? (
          <span className="num">
            <span className="hidden @max-[760px]:inline text-ink-3">
              To review{" "}
            </span>
            {row.to_review}
          </span>
        ) : (
          <span className="text-ink-3" role="img" aria-label="none">
            –
          </span>
        )}
      </td>
      <td className={TD}>
        {finished ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="num">{row.criteria_decided}</span>
            <span className="text-ink-3">of 8</span>
            <Meter
              decided={row.criteria_decided}
              className="w-16"
              label={`${row.criteria_decided} of 8 criteria decided`}
            />
          </div>
        ) : (
          <span className="text-ink-3" role="img" aria-label="none">
            –
          </span>
        )}
      </td>
      <td className={TD}>
        <Status kind={status.kind}>{status.label}</Status>
        <div className="mt-0.5 pl-[18px] text-label text-ink-3">
          <time dateTime={run.created_at} title={run.created_at}>
            {age(run.created_at)}
          </time>
        </div>
      </td>
    </tr>
  );
}

export function SitesTable({ rows }: { rows: Site[] }) {
  const [filter, setFilter] = useState<SiteFilter>("all");
  const shown = filterSites(rows, filter);
  return (
    <Panel aria-labelledby="sites-h">
      <PanelHeader
        id="sites-h"
        title="Sites"
        right={
          <>
            <ToggleGroup
              aria-label="Show sites"
              value={[filter]}
              onValueChange={(value) => {
                const next = value[0] as SiteFilter | undefined;
                if (next) setFilter(next);
              }}
              size="sm"
            >
              {FILTERS.map((f) => (
                <ToggleGroupItem key={f.value} value={f.value}>
                  {f.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <QuietLink href="/audits" className="max-[720px]:hidden">
              All audits
            </QuietLink>
          </>
        }
      />
      <div className="@container min-w-0">
        <table className="w-full text-dense @max-[760px]:block">
          <caption className="sr-only">Sites and their latest audit</caption>
          <thead className="@max-[760px]:hidden">
            <tr className="h-9 border-b border-line text-left text-xs font-medium text-ink-3">
              <th scope="col" className="w-[34%] px-3 first:pl-4 font-medium">
                Site
              </th>
              <th scope="col" className="px-3 font-medium">
                Failures
              </th>
              <th
                scope="col"
                className="px-3 text-right font-medium whitespace-nowrap"
              >
                To review
              </th>
              <th scope="col" className="px-3 font-medium">
                Criteria decided
              </th>
              <th scope="col" className="px-3 last:pr-4 font-medium">
                Latest audit
              </th>
            </tr>
          </thead>
          <tbody className="@max-[760px]:block">
            {shown.map((row) => (
              <Row key={row.site} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 ? (
        <p className="m-0 px-4 py-6 text-center text-body text-ink-2">
          No sites match this filter.
        </p>
      ) : null}
      <output className="sr-only">
        {shown.length} of {rows.length} sites shown
      </output>
    </Panel>
  );
}
