"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { api, type RunSummary } from "@/api/client";
import {
  EmptyState,
  PageHeader,
  Panel,
  SeverityCounts,
  Tag,
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
import { runLabel } from "@/lib/shell";
import { age } from "@/lib/url";
import { FilterSelect } from "./filter-select";
import { RunStatus } from "./run-status";

const RUN_LIMIT = 100;

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "running", label: "Running" },
  { value: "done", label: "Complete" },
  { value: "partial", label: "Partly complete" },
  { value: "failed", label: "Audit failed" },
  { value: "cancelled", label: "Cancelled" },
];

const VIEWPORT_OPTIONS = [
  { value: "", label: "All" },
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
];

export function filterRuns(
  runs: RunSummary[],
  filters: { status: string; vp: string; site: string },
): RunSummary[] {
  return runs.filter((run) => {
    if (filters.status === "running") {
      if (run.status !== "running" && run.status !== "queued") return false;
    } else if (filters.status && run.status !== filters.status) return false;
    if (filters.vp && !run.viewports.includes(filters.vp as "desktop"))
      return false;
    if (filters.site && runLabel(run) !== filters.site) return false;
    return true;
  });
}

export function AuditsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const vp = params.get("vp") ?? "";
  const siteFilter = params.get("site") ?? "";
  const filters = useMemo(
    () => ({ status, vp, site: siteFilter }),
    [status, vp, siteFilter],
  );

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["runs", "all"],
    queryFn: async () => {
      const { data: runs, error } = await api.GET("/runs", {
        params: { query: { limit: RUN_LIMIT } },
      });
      if (error) throw new Error("Could not load audits");
      return runs;
    },
    refetchInterval: (query) =>
      query.state.data?.some(
        (r) => r.status === "queued" || r.status === "running",
      )
        ? 2000
        : false,
  });

  const siteOptions = useMemo(() => {
    const names = [...new Set((data ?? []).map((run) => runLabel(run)))].sort();
    return [
      { value: "", label: "All" },
      ...names.map((name) => ({ value: name, label: name })),
    ];
  }, [data]);

  const rows = useMemo(() => filterRuns(data ?? [], filters), [data, filters]);
  const filtered = Boolean(filters.status || filters.vp || filters.site);

  function setFilter(key: "status" | "vp" | "site", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <>
      <PageHeader
        title="Audits"
        description="Every audit you have run, with filters by status, viewport and site."
        actions={
          <Link
            href="/audit/new"
            className={buttonVariants({ variant: "primary" })}
          >
            New audit
          </Link>
        }
      />
      <div
        role="group"
        aria-label="Filters"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => setFilter("status", v)}
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          label="Viewport"
          value={filters.vp}
          onChange={(v) => setFilter("vp", v)}
          options={VIEWPORT_OPTIONS}
        />
        <FilterSelect
          label="Site"
          value={filters.site}
          onChange={(v) => setFilter("site", v)}
          options={siteOptions}
        />
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.replace(pathname, { scroll: false })}
          >
            Clear filters
          </Button>
        ) : null}
        <p
          role="status"
          aria-live="polite"
          className="m-0 ml-auto text-dense text-ink-3"
        >
          {data
            ? data.length >= RUN_LIMIT
              ? `${rows.length} of the latest ${RUN_LIMIT} audits`
              : `${rows.length} of ${data.length} audits`
            : ""}
        </p>
      </div>
      <Panel aria-label="Audits">
        {isPending ? (
          <p className="m-0 p-4 text-ink-2" aria-busy="true">
            Loading audits
          </p>
        ) : isError ? (
          <EmptyState
            title="Audits are unavailable"
            action={<Button onClick={() => refetch()}>Try again</Button>}
          >
            The audit service did not answer. Check that it is running, then try
            again.
          </EmptyState>
        ) : data.length === 0 ? (
          <EmptyState
            title="No audits yet"
            action={
              <Link
                href="/audit/new"
                className={buttonVariants({ variant: "primary" })}
              >
                New audit
              </Link>
            }
          >
            Run your first audit and it will be listed here.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No audits match these filters"
            action={
              <Button
                onClick={() => router.replace(pathname, { scroll: false })}
              >
                Clear filters
              </Button>
            }
          >
            Change or clear a filter to see more audits.
          </EmptyState>
        ) : (
          <Table regionLabel="Audits, scrollable table">
            <TableCaption className="sr-only">
              Audits, newest first
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Site</TableHead>
                <TableHead scope="col">Viewports</TableHead>
                <TableHead scope="col">Method</TableHead>
                <TableHead scope="col">Failures</TableHead>
                <TableHead scope="col">To review</TableHead>
                <TableHead scope="col">Started</TableHead>
                <TableHead scope="col">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <Link
                      href={`/runs/${run.id}`}
                      className="inline-flex min-h-6 max-w-72 items-center truncate font-medium text-ink underline-offset-4 hover:underline"
                      title={runLabel(run)}
                    >
                      {runLabel(run)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-2">
                    {run.viewports.join(" and ")}
                  </TableCell>
                  <TableCell>
                    <Tag>
                      {run.condition === "hybrid"
                        ? "Detector and rules"
                        : "Rules only"}
                    </Tag>
                  </TableCell>
                  <TableCell>
                    <SeverityCounts
                      critical={run.counts.critical}
                      serious={run.counts.serious}
                      minor={run.counts.minor}
                    />
                  </TableCell>
                  <TableCell className="num">
                    {run.counts.needs_review ?? 0}
                  </TableCell>
                  <TableCell className="text-ink-3">
                    {age(run.created_at)}
                  </TableCell>
                  <TableCell>
                    <RunStatus status={run.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
