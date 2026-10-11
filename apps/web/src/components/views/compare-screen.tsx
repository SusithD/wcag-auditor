"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { api, TERMINAL } from "@/api/client";
import {
  Panel,
  PanelBody,
  PanelHeader,
  ScCode,
  type ShapeKind,
  StatusShape,
} from "@/components/ds";
import { Canvas } from "@/components/report/canvas";
import type { PairMode } from "@/components/report/focus-pair";
import { scTitle } from "@/components/report/logic";
import { WideContent } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useOverview } from "@/hooks/use-report-data";
import { useCompare } from "@/hooks/use-run-views";
import { counterpart, diffRowLabel, SyncBus } from "@/lib/compare";
import {
  type Finding,
  SEV_LABEL,
  type SevKey,
  sevKey,
  type Viewport,
} from "@/lib/report";
import { RunHeader } from "./run-header";
import { ViewMessage } from "./view-message";
import { useViewportParam } from "./viewport-state";

const SEV_SHAPE: Record<SevKey, ShapeKind> = {
  critical: "critical",
  serious: "serious",
  minor: "minor",
  "needs-review": "review",
};

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
  if (compare.isError && run.data && viewport) {
    return (
      <div className="w-full">
        <RunHeader
          runId={runId}
          run={run.data}
          viewport={viewport}
          available={available}
          current="compare"
          onViewport={setViewport}
        />
        <Panel className="mt-6" aria-labelledby="unavailable-h">
          <PanelBody>
            <h2 id="unavailable-h" className="t-section text-ink">
              Compare is not available for this run
            </h2>
            <p className="mt-1 text-ink-2">
              Compare needs an audit that used Detector and rules. It shows the
              same capture with and without the pixel channel.
            </p>
          </PanelBody>
        </Panel>
      </div>
    );
  }
  if (!run.data || !viewport || overview.isPending || !compare.data) {
    return (
      <div aria-busy="true">
        <title>Compare - WCAG Auditor</title>
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
    <div className="w-full">
      <WideContent />
      <RunHeader
        runId={runId}
        run={run.data}
        viewport={viewport}
        available={available}
        current="compare"
        onViewport={setViewport}
        actions={
          <label className="inline-flex min-h-8 items-center gap-2 text-dense text-ink">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={linked}
              onChange={(e) => {
                bus.current.enabled = e.target.checked;
                setLinked(e.target.checked);
              }}
            />
            Sync views
          </label>
        }
      />
      <h2 className="sr-only">Compare Detector and rules with Rules only</h2>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel aria-labelledby="left-h" className="overflow-hidden">
          <PanelHeader
            id="left-h"
            title="Detector and rules"
            right={<span className="num">{data.hybrid.length} findings</span>}
          />
          <div
            role="group"
            aria-label="Detector and rules report"
            className="h-[70dvh] overflow-hidden"
          >
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
              label="Detector and rules"
              sync={syncA}
            />
          </div>
        </Panel>
        <Panel aria-labelledby="right-h" className="overflow-hidden">
          <PanelHeader
            id="right-h"
            title="Rules only"
            right={
              <span className="num">{data.rule_only.length} findings</span>
            }
          />
          <div
            role="group"
            aria-label="Rules only report"
            className="h-[70dvh] overflow-hidden"
          >
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
              label="Rules only"
              sync={syncB}
            />
          </div>
        </Panel>
      </div>

      <Panel aria-labelledby="diff-h" className="mt-6">
        <PanelHeader
          id="diff-h"
          title="Findings in one view only"
          right={
            diff.length > 0 ? (
              <span className="num">
                {data.only_hybrid.length} only in Detector and rules,{" "}
                {data.only_rule_only.length} only in Rules only
              </span>
            ) : null
          }
        />
        {diff.length === 0 ? (
          <p className="p-4 text-ink-2">
            Both views report the same findings for this page.
          </p>
        ) : (
          <>
            <p className="px-4 pt-3 text-dense text-ink-3">
              Selecting a row selects it on its canvas.
            </p>
            <ul className="mt-2 divide-y divide-line">
              {diff.map(({ side, finding }, index) => {
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
                      className="grid min-h-11 w-full grid-cols-[minmax(12rem,17rem)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-1 text-left text-dense text-ink hover:bg-subtle aria-pressed:bg-tint max-[720px]:grid-cols-[1fr_auto]"
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <ScCode code={finding.sc} className="shrink-0" />
                        <span
                          className="truncate text-ink"
                          title={scTitle(finding.sc)}
                        >
                          {scTitle(finding.sc)}
                        </span>
                      </span>
                      <span
                        className="truncate font-mono text-label max-[720px]:hidden"
                        title={finding.element}
                      >
                        {finding.element}
                      </span>
                      <span className="flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-ink">
                          <StatusShape kind={SEV_SHAPE[k]} />
                          {SEV_LABEL[k]}
                        </span>
                        <span className="text-ink-3">
                          Only in{" "}
                          {side === "hybrid"
                            ? "Detector and rules"
                            : "Rules only"}
                        </span>
                      </span>
                      <span className="sr-only">
                        {diffRowLabel({ side, finding }, index, diff.length)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}

function Message({ title }: { title: string }) {
  return <ViewMessage title={title} view="Compare" />;
}
