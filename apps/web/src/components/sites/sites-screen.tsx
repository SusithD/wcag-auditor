"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/api/client";
import { RunStatus, siteInitial } from "@/components/audits/run-status";
import {
  EmptyState,
  Meter,
  PageHeader,
  Panel,
  SeverityCounts,
} from "@/components/ds";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { age } from "@/lib/url";
import { cn } from "@/lib/utils";
import { siteLabel } from "./site-label";

const CELL =
  "max-[720px]:block max-[720px]:px-4 max-[720px]:py-1 max-[720px]:whitespace-normal";

export function deltaWords(delta: number | null): string {
  if (delta === null) return "No earlier audit to compare with";
  if (delta === 0) return "No change since last audit";
  const n = Math.abs(delta);
  const noun = n === 1 ? "failure" : "failures";
  return delta > 0
    ? `${n} more ${noun} since last audit`
    : `${n} fewer ${noun} since last audit`;
}

export function SitesScreen() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data: rows, error } = await api.GET("/sites");
      if (error) throw new Error("Could not load sites");
      return rows;
    },
    refetchInterval: (query) =>
      query.state.data?.some((r) => {
        const status = (r.newer_run ?? r.latest_run).status;
        return status === "queued" || status === "running";
      })
        ? 2000
        : false,
  });

  return (
    <>
      <PageHeader
        title="Sites"
        description="One row per site, with its latest audit and what changed since the one before."
        actions={
          <Link href="/audit/new" className={buttonVariants()}>
            New audit
          </Link>
        }
      />
      <Panel aria-label="Sites">
        {isPending ? (
          <p className="m-0 p-4 text-ink-2" aria-busy="true">
            Loading sites
          </p>
        ) : isError ? (
          <EmptyState
            title="Sites are unavailable"
            action={<Button onClick={() => refetch()}>Try again</Button>}
          >
            The audit service did not answer. Check that it is running, then try
            again.
          </EmptyState>
        ) : data.length === 0 ? (
          <EmptyState
            title="No sites yet"
            action={
              <Link
                href="/audit/new"
                className={buttonVariants({ variant: "primary" })}
              >
                New audit
              </Link>
            }
          >
            Sites appear here once you have run an audit.
          </EmptyState>
        ) : (
          <Table regionLabel="Sites, scrollable table">
            <TableCaption className="sr-only">
              Sites with their latest audit
            </TableCaption>
            <TableHeader className="max-[720px]:hidden">
              <TableRow>
                <TableHead scope="col">Site</TableHead>
                <TableHead scope="col" className="min-w-56">
                  Failures
                </TableHead>
                <TableHead scope="col" className="whitespace-nowrap">
                  To review
                </TableHead>
                <TableHead scope="col">Criteria decided</TableHead>
                <TableHead scope="col">Latest audit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="max-[720px]:block">
              {data.map((row) => {
                const run = row.latest_run;
                const shown = row.newer_run ?? run;
                const finished =
                  run.status === "done" || run.status === "partial";
                return (
                  <TableRow
                    key={row.site}
                    className="h-14 max-[720px]:block max-[720px]:h-auto max-[720px]:py-2"
                  >
                    <TableCell className={CELL}>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-6 shrink-0 place-items-center rounded-md bg-subtle text-xs font-semibold text-ink-2"
                        >
                          {siteInitial(siteLabel(row.site))}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/runs/${run.id}`}
                            className="inline-flex min-h-6 items-center font-medium text-ink underline-offset-4 hover:underline"
                          >
                            {siteLabel(row.site)}
                          </Link>
                          <div className="text-xs text-ink-3">
                            {run.viewports.join(" and ")}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={CELL}>
                      {finished ? (
                        <div>
                          <SeverityCounts
                            className="whitespace-nowrap"
                            critical={run.counts.critical}
                            serious={run.counts.serious}
                            minor={run.counts.minor}
                          />
                          <div className="text-xs text-ink-3">
                            {deltaWords(row.failures_delta)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-ink-3">Not available yet</span>
                      )}
                    </TableCell>
                    <TableCell className={`${CELL} num`}>
                      <span className="hidden text-ink-3 max-[720px]:inline">
                        To review{" "}
                      </span>
                      {finished ? row.to_review : "-"}
                    </TableCell>
                    <TableCell className={CELL}>
                      {finished ? (
                        <div className="grid w-36 gap-1">
                          <Meter
                            decided={row.criteria_decided}
                            undecided={8 - row.criteria_decided}
                          />
                          <span className="num text-xs text-ink-3">
                            {row.criteria_decided} of 8
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-3">-</span>
                      )}
                    </TableCell>
                    <TableCell className={CELL}>
                      <div className="grid gap-0.5">
                        <RunStatus status={shown.status} />
                        <span className={cn("text-xs text-ink-3")}>
                          {age(shown.created_at)}
                          {row.newer_run
                            ? ` (report from ${age(run.created_at)})`
                            : ""}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
