"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { api, TERMINAL } from "@/api/client";
import { Canvas } from "@/components/report/canvas";
import type { PairMode } from "@/components/report/focus-pair";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useOverview } from "@/hooks/use-report-data";
import { useCompare } from "@/hooks/use-run-views";
import { counterpart, SyncBus } from "@/lib/compare";
import {
  type Finding,
  SC_TITLES,
  SEV_GLYPH,
  SEV_LABEL,
  sevKey,
  type Viewport,
} from "@/lib/report";
import { RunNav } from "./run-nav";
import { useViewportParam } from "./viewport-state";

export function CompareScreen({ runId }: { runId: string }) {
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: async () => {
      const { data, error } = await api.GET("/runs/{run_id}", {
        params: { path: { run_id: runId } },
      });
      if (error || !data) throw new Error("This run could not be loaded");
      return data;
    },
  });
  const available = (run.data?.available_viewports ?? []) as Viewport[];
  const { viewport, setViewport } = useViewportParam(available);
  const overview = useOverview(runId, viewport);
  const compare = useCompare(runId, viewport);
  const bus = useRef(new SyncBus());
  const [hybridKey, setHybridKey] = useState<string | null>(null);
  const [ruleKey, setRuleKey] = useState<string | null>(null);
  const [pairA, setPairA] = useState<PairMode>("page");
  const [pairB, setPairB] = useState<PairMode>("page");
  const [linked, setLinked] = useState(true);
  const syncA = useMemo(() => ({ bus: bus.current, id: "hybrid" }), []);
  const syncB = useMemo(() => ({ bus: bus.current, id: "rule_only" }), []);

  if (run.isError) return <Message title="This run could not be loaded" />;
  if (run.data && !TERMINAL.has(run.data.status))
    return <Message title="The audit is still running" />;
  if (run.data && available.length === 0)
    return <Message title="This run has no report" />;
  if (compare.isError) {
    return (
      <Message
        title="Compare is not available for this run"
        detail="Compare needs a hybrid run: it shows the same capture with and without the pixel channel."
      />
    );
  }
  if (!run.data || !viewport || overview.isPending || compare.isPending) {
    return (
      <div className="p-6" aria-busy="true">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (overview.isError)
    return <Message title="The report could not be loaded" />;

  const data = compare.data;
  const size = {
    w: overview.data.screenshot_width,
    h: overview.data.screenshot_height,
  };
  const selectHybrid = (key: string | null) => {
    setHybridKey(key);
    setRuleKey(counterpart(data.pairs, "hybrid", key));
  };
  const selectRule = (key: string | null) => {
    setRuleKey(key);
    setHybridKey(counterpart(data.pairs, "rule_only", key));
  };
  const diff: { side: "hybrid" | "rule_only"; finding: Finding }[] = [
    ...data.hybrid
      .filter((f) => data.only_hybrid.includes(f.key))
      .map((finding) => ({ side: "hybrid" as const, finding })),
    ...data.rule_only
      .filter((f) => data.only_rule_only.includes(f.key))
      .map((finding) => ({ side: "rule_only" as const, finding })),
  ];

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-4">
      <title>{`Compare - ${overview.data.url}`}</title>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold">
            Compare hybrid and rule-only
          </h1>
          <p className="font-mono text-label text-muted-foreground">
            {overview.data.url}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RunNav runId={runId} current="compare" query={`?vp=${viewport}`} />
          <label className="inline-flex min-h-7 items-center gap-2 text-body">
            <input
              type="checkbox"
              className="size-4"
              checked={linked}
              onChange={(e) => {
                bus.current.enabled = e.target.checked;
                setLinked(e.target.checked);
              }}
            />
            Sync views
          </label>
          {available.length > 1 ? (
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[viewport]}
              onValueChange={(v) => v[0] && setViewport(v[0] as Viewport)}
              aria-label="Viewport"
            >
              {available.map((vp) => (
                <ToggleGroupItem key={vp} value={vp}>
                  {vp === "desktop" ? "Desktop" : "Mobile"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="left-h" className="min-w-0">
          <h2 id="left-h" className="mb-1 text-h3 font-semibold">
            Hybrid{" "}
            <span className="font-mono text-label text-muted-foreground">
              {data.hybrid.length} findings
            </span>
          </h2>
          <div className="h-[70dvh] overflow-hidden rounded-lg border">
            <Canvas
              runId={runId}
              viewport={viewport}
              url={overview.data.url}
              size={size}
              findings={data.hybrid}
              selectedKey={hybridKey}
              onSelect={selectHybrid}
              pairMode={pairA}
              onPairMode={setPairA}
              focusStops={overview.data.focus_stops}
              label="Hybrid"
              sync={syncA}
            />
          </div>
        </section>
        <section aria-labelledby="right-h" className="min-w-0">
          <h2 id="right-h" className="mb-1 text-h3 font-semibold">
            Rule-only{" "}
            <span className="font-mono text-label text-muted-foreground">
              {data.rule_only.length} findings
            </span>
          </h2>
          <div className="h-[70dvh] overflow-hidden rounded-lg border">
            <Canvas
              runId={runId}
              viewport={viewport}
              url={overview.data.url}
              size={size}
              findings={data.rule_only}
              selectedKey={ruleKey}
              onSelect={selectRule}
              pairMode={pairB}
              onPairMode={setPairB}
              focusStops={0}
              label="Rule-only"
              sync={syncB}
            />
          </div>
        </section>
      </div>

      <section aria-labelledby="diff-h" className="mt-6">
        <h2 id="diff-h" className="text-h3 font-semibold">
          Findings in one view only
        </h2>
        {diff.length === 0 ? (
          <p className="mt-2 text-body text-muted-foreground">
            Both views report the same findings for this page.
          </p>
        ) : (
          <>
            <p className="mt-1 text-caption text-muted-foreground">
              {data.only_hybrid.length} only in hybrid,{" "}
              {data.only_rule_only.length} only in rule-only. Selecting a row
              selects it on its canvas.
            </p>
            <ul className="mt-2 divide-y rounded-lg border bg-card">
              {diff.map(({ side, finding }) => {
                const k = sevKey(finding);
                const selected =
                  (side === "hybrid" ? hybridKey : ruleKey) === finding.key;
                return (
                  <li key={`${side}-${finding.key}`}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        side === "hybrid"
                          ? selectHybrid(finding.key)
                          : selectRule(finding.key)
                      }
                      className="grid min-h-9 w-full grid-cols-[8rem_1fr_auto] items-center gap-3 px-3 py-1 text-left text-body hover:bg-muted aria-pressed:bg-muted"
                    >
                      <span className="font-mono text-label">
                        {finding.sc} {SC_TITLES[finding.sc]?.split(" ")[0]}
                      </span>
                      <span
                        className="truncate font-mono text-label"
                        title={finding.element}
                      >
                        {finding.element}
                      </span>
                      <span className="flex items-center gap-3 text-caption">
                        <span
                          className={`text-sev-${k === "needs-review" ? "review" : k}`}
                        >
                          <span aria-hidden="true">{SEV_GLYPH[k]}</span>{" "}
                          {SEV_LABEL[k]}
                        </span>
                        <span>
                          Only in {side === "hybrid" ? "hybrid" : "rule-only"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function Message({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mx-auto max-w-160 px-6 py-12">
      <h1 className="text-h2 font-semibold">{title}</h1>
      {detail ? (
        <p className="mt-2 text-body text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}
