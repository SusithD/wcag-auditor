"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type RunSummary } from "@/api/client";
import { SeverityTriplet } from "@/components/severity-triplet";
import { Badge } from "@/components/ui/badge";
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

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  partial: "Partly done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function label(run: RunSummary) {
  if (run.source_kind === "url") return run.source.replace(/^https?:\/\//, "");
  if (run.source_kind === "folder") return run.source.split("/").slice(-1)[0];
  return "Uploaded screenshots";
}

function runName(run: RunSummary) {
  const condition = run.condition === "hybrid" ? "hybrid" : "rule-only";
  const status = (STATUS_LABEL[run.status] ?? run.status).toLowerCase();
  return `${label(run)}, ${condition}, ${status}, ${age(run.created_at)}`;
}

export function RecentRuns() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["runs"],
    queryFn: async () => {
      const { data: runs, error } = await api.GET("/runs", {
        params: { query: { limit: 10 } },
      });
      if (error) throw new Error("Could not load recent runs");
      return runs;
    },
    refetchInterval: (query) =>
      query.state.data?.some(
        (r) => r.status === "queued" || r.status === "running",
      )
        ? 2000
        : false,
  });

  return (
    <section aria-labelledby="recent-h" className="mt-12">
      <h2 id="recent-h" className="text-h3 font-semibold">
        Recent runs
      </h2>
      {isPending ? (
        <p className="mt-2 text-body text-muted-foreground" aria-busy="true">
          Loading recent runs
        </p>
      ) : isError ? (
        <p className="mt-2 text-body text-muted-foreground">
          Recent runs are unavailable because the audit service did not answer.
        </p>
      ) : data.length === 0 ? (
        <p className="mt-2 text-body text-muted-foreground">
          No audits yet. Run your first one above.
        </p>
      ) : (
        <Table className="mt-2" regionLabel="Recent runs, scrollable table">
          <TableCaption className="sr-only">
            The ten most recent audits
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead className="hidden md:table-cell">Viewports</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((run) => (
              <TableRow key={run.id} className="h-9">
                <TableCell>
                  <Link
                    href={`/runs/${run.id}`}
                    className="inline-block min-h-8 max-w-40 truncate align-middle leading-8 underline underline-offset-4 md:max-w-56"
                    title={label(run)}
                    aria-label={runName(run)}
                  >
                    {label(run)}
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {run.viewports.join(", ")}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {run.condition === "hybrid" ? "Hybrid" : "Rule-only"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <SeverityTriplet counts={run.counts} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {age(run.created_at)}
                </TableCell>
                <TableCell>{STATUS_LABEL[run.status] ?? run.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
