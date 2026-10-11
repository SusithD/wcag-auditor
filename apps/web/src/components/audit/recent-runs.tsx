"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type RunSummary } from "@/api/client";
import { Panel, SeverityCounts } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { siteParts } from "@/lib/overview";
import { age } from "@/lib/url";
import { startAudit } from "./audit-request";

export function recentAddresses(runs: RunSummary[], limit = 3): RunSummary[] {
  const seen = new Set<string>();
  const out: RunSummary[] = [];
  for (const run of runs) {
    if (run.source_kind !== "url" || seen.has(run.source)) continue;
    seen.add(run.source);
    out.push(run);
    if (out.length === limit) break;
  }
  return out;
}

export function RecentRuns() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data, isPending, isError } = useQuery({
    queryKey: ["runs", "recent-addresses"],
    queryFn: async () => {
      const { data: runs, error: failure } = await api.GET("/runs", {
        params: { query: { limit: 30 } },
      });
      if (failure || !runs) throw new Error("Could not load recent runs");
      return recentAddresses(runs);
    },
  });

  const again = useMutation({
    mutationFn: (run: RunSummary) =>
      startAudit(
        { url: run.source },
        {
          viewports: run.viewports,
          condition: run.condition,
          budget: 15,
        },
        queryClient,
      ),
    onSuccess: (runId) => router.push(`/runs/${runId}`),
    onError: (err) =>
      setError(
        err instanceof Error
          ? err.message
          : "The audit could not be started. Try again.",
      ),
  });

  return (
    <section aria-labelledby="recent-h" className="mt-8">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="recent-h" className="t-section text-ink">
          Recent addresses
        </h2>
        <Link href="/audits" className="text-dense text-ink-2 underline">
          All audits
        </Link>
      </div>
      <Panel as="div">
        {isPending ? (
          <div className="space-y-2 p-4" aria-busy="true">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <p className="p-4 text-body text-ink-2">
            Recent addresses are unavailable because the audit service did not
            answer.
          </p>
        ) : data.length === 0 ? (
          <p className="p-4 text-body text-ink-2">
            No audits yet. Addresses you audit will appear here.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {data.map((run) => {
              const { host, path } = siteParts(run);
              return (
                <li
                  key={run.id}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 last:border-b-0 max-[720px]:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span className="min-w-0 truncate font-medium">
                    {host}
                    <small className="block truncate text-label font-normal text-ink-3">
                      {path}
                    </small>
                  </span>
                  <time
                    dateTime={run.created_at}
                    className="num text-dense text-ink-3 max-[720px]:order-3"
                  >
                    {age(run.created_at)}
                  </time>
                  <SeverityCounts
                    critical={run.counts.critical}
                    serious={run.counts.serious}
                    minor={run.counts.minor}
                    className="max-[720px]:order-2"
                  />
                  <button
                    type="button"
                    aria-disabled={again.isPending}
                    aria-label={`Run again for ${host}`}
                    onClick={() => {
                      if (again.isPending) return;
                      setError(null);
                      again.mutate(run);
                    }}
                    className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-dense font-medium text-ink-2 hover:bg-subtle hover:text-ink max-[720px]:order-4"
                  >
                    <RotateCw className="size-3.5" aria-hidden="true" />
                    Run again
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {error ? (
        <p role="alert" className="mt-2 text-body text-critical">
          {error}
        </p>
      ) : null}
    </section>
  );
}
