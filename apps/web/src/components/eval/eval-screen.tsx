"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useEvalDetail,
  useEvalList,
  useEvalProgress,
  useStartEval,
} from "@/hooks/use-eval";
import {
  CONDITION_LABEL,
  cellsFor,
  type EvalView,
  fmt,
  fmtCi,
  fmtP,
  progressFraction,
  STRATA,
  STRATUM_LABEL,
  type Stratum,
} from "@/lib/eval";
import { SC_LIST, SC_TITLES } from "@/lib/report";
import { EvalChart } from "./eval-chart";

export function EvalScreen() {
  const list = useEvalList();
  const [chosen, setChosen] = useState<number | undefined>();
  const evalId = chosen ?? list.data?.[0]?.id;
  const detail = useEvalDetail(evalId);
  const start = useStartEval();
  const [stratum, setStratum] = useState<Stratum>("real");
  const [condition, setCondition] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);

  const summary = list.data?.find((e) => e.id === evalId);
  const running =
    list.data?.some((e) => e.status === "running" || e.status === "queued") ??
    false;
  const runningId = list.data?.find(
    (e) => e.status === "running" || e.status === "queued",
  )?.id;
  useEvalProgress(runningId, running);

  const bucket = summary?.total
    ? Math.floor(progressFraction(summary.done, summary.total) / 25) * 25
    : 0;
  const announcement = running
    ? bucket > 0
      ? `Evaluation ${bucket}% complete`
      : "Evaluation started"
    : summary?.status === "failed"
      ? "Evaluation failed"
      : "";
  const view = detail.data?.view ?? null;
  const conditions = view?.meta.conditions ?? [];
  const activeCondition =
    condition && conditions.includes(condition)
      ? condition
      : conditions.includes("hybrid")
        ? "hybrid"
        : conditions[0];

  useEffect(() => {
    if (start.data !== undefined) setChosen(start.data);
  }, [start.data]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      <title>Evaluation</title>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold">Evaluation</h1>
          <p className="text-body text-muted-foreground">
            Precision, recall and F1 per criterion on the frozen benchmark, with
            the hybrid against rule-only comparison.
          </p>
        </div>
        <Button
          onClick={() => {
            if (!running && !start.isPending)
              start.mutate(["rule_only", "pixel", "hybrid"]);
          }}
          aria-disabled={running || start.isPending}
          className="aria-disabled:opacity-60"
        >
          {running ? "Evaluation running" : "Run evaluation"}
        </Button>
      </div>

      {start.isError ? (
        <p role="alert" className="mt-3 text-body text-destructive">
          {start.error.message}
        </p>
      ) : null}

      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
      {running && summary ? (
        <div className="mt-4 rounded-lg border bg-card p-3">
          <p className="text-body">
            {summary.total
              ? `Scoring capture ${summary.done ?? 0} of ${summary.total}`
              : "Starting the evaluation"}
          </p>
          <Progress
            value={progressFraction(summary.done, summary.total)}
            aria-label="Evaluation progress"
            className="mt-2"
          />
        </div>
      ) : null}

      {list.isPending ? (
        <div className="mt-6" aria-busy="true">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : list.isError ? (
        <p className="mt-6 text-body text-muted-foreground">
          The evaluations could not be loaded.
        </p>
      ) : list.data.length === 0 ? (
        <p className="mt-6 text-body text-muted-foreground">
          No evaluation has been run yet. Run one to score the benchmark against
          the sealed ground truth.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="eval-pick" className="text-body font-medium">
              Evaluation
            </label>
            <select
              id="eval-pick"
              value={evalId}
              onChange={(e) => setChosen(Number(e.target.value))}
              className="min-h-8 rounded-md border border-input bg-background px-2 text-body"
            >
              {list.data.map((e) => (
                <option key={e.id} value={e.id}>
                  #{e.id} {e.source === "import" ? "(imported)" : ""} {e.status}{" "}
                  {new Date(e.created_at).toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          {summary?.status === "failed" ? (
            <p role="alert" className="mt-4 text-body text-destructive">
              This evaluation failed: {summary.error}
            </p>
          ) : null}

          {detail.isPending && summary?.status === "done" ? (
            <div className="mt-6" aria-busy="true">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : null}

          {view && activeCondition ? (
            <Results
              evalId={evalId as number}
              view={view}
              stratum={stratum}
              onStratum={setStratum}
              condition={activeCondition}
              onCondition={setCondition}
              asTable={asTable}
              onAsTable={setAsTable}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

const COUNT_TERMS: Record<string, string> = {
  TP: "True positives: findings that match the ground truth",
  FP: "False positives: findings with no match in the ground truth",
  FN: "False negatives: ground-truth findings that were missed",
  Dup: "Duplicates: extra reports of a finding already matched",
};

function Results({
  evalId,
  view,
  stratum,
  onStratum,
  condition,
  onCondition,
  asTable,
  onAsTable,
}: {
  evalId: number;
  view: EvalView;
  stratum: Stratum;
  onStratum: (s: Stratum) => void;
  condition: string;
  onCondition: (c: string) => void;
  asTable: boolean;
  onAsTable: (v: boolean) => void;
}) {
  const cells = cellsFor(view, condition, stratum);
  const mcnemar = view.mcnemar.filter((m) => m.stratum === stratum);
  const deltas = view.delta_precision.filter((d) => d.stratum === stratum);
  const m = view.meta;

  return (
    <Tabs
      className="mt-4"
      value={stratum}
      onValueChange={(v) => onStratum(v as Stratum)}
    >
      <p className="text-caption text-muted-foreground">
        {m.items_scored} captures scored ({m.items_unlabelled} without ground
        truth), seed {m.seed}, {m.resamples.toLocaleString()} bootstrap
        resamples,{" "}
        {m.include_needs_review
          ? "needs-review findings included"
          : "automated findings only"}
        . Benchmark{" "}
        <span className="font-mono">{m.benchmark_sha?.slice(0, 12)}</span>,
        truth <span className="font-mono">{m.truth_sha?.slice(0, 12)}</span>,
        protocol{" "}
        <span className="font-mono">{m.protocol_sha?.slice(0, 12)}</span>.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <TabsList aria-label="Stratum">
          {STRATA.map((s) => (
            <TabsTrigger key={s} value={s}>
              {STRATUM_LABEL[s]}
            </TabsTrigger>
          ))}
        </TabsList>
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[condition]}
          onValueChange={(v) => v[0] && onCondition(v[0])}
          aria-label="Condition"
        >
          {m.conditions.map((c) => (
            <ToggleGroupItem key={c} value={c}>
              {CONDITION_LABEL[c] ?? c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          variant={asTable ? "secondary" : "outline"}
          size="sm"
          aria-pressed={asTable}
          onClick={() => onAsTable(!asTable)}
        >
          View as table
        </Button>
        <span className="ml-auto flex gap-3 text-body">
          <a
            className="inline-flex min-h-7 items-center underline underline-offset-4"
            href={`/api/eval/${evalId}/export.csv?condition=${condition}&stratum=${stratum}`}
            download
          >
            Export CSV
          </a>
          <a
            className="inline-flex min-h-7 items-center underline underline-offset-4"
            href={`/api/eval/${evalId}/export.tex`}
            download
          >
            Export LaTeX
          </a>
        </span>
      </div>

      <TabsContent value={stratum}>
        <section aria-labelledby="per-sc-h" className="mt-4">
          <h2 id="per-sc-h" className="text-h3 font-semibold">
            {CONDITION_LABEL[condition] ?? condition},{" "}
            {STRATUM_LABEL[stratum].toLowerCase()} stratum
          </h2>
          {asTable ? (
            <>
              <div
                role="region"
                aria-label="Per-criterion results"
                tabIndex={0}
                className="mt-2 overflow-x-auto"
              >
                <table className="w-full border-collapse text-row">
                  <caption className="sr-only">
                    Per-criterion results for {CONDITION_LABEL[condition]} on
                    the {stratum} stratum
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Criterion",
                        "TP",
                        "FP",
                        "FN",
                        "Dup",
                        "Precision",
                        "Recall",
                        "F1",
                      ].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="border-b px-3 py-2 text-left font-medium"
                        >
                          {COUNT_TERMS[h] ? (
                            <abbr title={COUNT_TERMS[h]}>{h}</abbr>
                          ) : (
                            h
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cells.map((c) => (
                      <tr key={c.sc}>
                        <th
                          scope="row"
                          className="border-b px-3 py-2 text-left font-normal"
                        >
                          <span className="font-mono text-label">{c.sc}</span>{" "}
                          {SC_TITLES[c.sc]}
                        </th>
                        <td className="border-b px-3 py-2 font-mono text-label">
                          {c.tp}
                        </td>
                        <td className="border-b px-3 py-2 font-mono text-label">
                          {c.fp}
                        </td>
                        <td className="border-b px-3 py-2 font-mono text-label">
                          {c.fn}
                        </td>
                        <td className="border-b px-3 py-2 font-mono text-label">
                          {c.duplicates}
                        </td>
                        <td className="border-b px-3 py-2 font-mono text-label">
                          {fmt(c.precision)} {fmtCi(c.precision_ci)}
                        </td>
                        <td className="border-b px-3 py-2 font-mono text-label">
                          {fmt(c.recall)} {fmtCi(c.recall_ci)}
                        </td>
                        <td className="border-b px-3 py-2 font-mono text-label">
                          {fmt(c.f1)} {fmtCi(c.f1_ci)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-caption text-muted-foreground">
                TP true positives, FP false positives, FN missed findings, Dup
                duplicate reports of one finding.
              </p>
            </>
          ) : (
            <div className="mt-2">
              <EvalChart
                cells={cells}
                condition={condition}
                stratum={stratum}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="tests-h" className="mt-8">
          <h2 id="tests-h" className="text-h3 font-semibold">
            Hybrid against rule-only
          </h2>
          {mcnemar.length === 0 ? (
            <p className="mt-2 text-body text-muted-foreground">
              This evaluation compared a single condition, so there is no paired
              test.
            </p>
          ) : (
            <>
              <p className="mt-1 text-caption text-muted-foreground">
                Exact McNemar test on paired per-unit outcomes ({view.mcnemar_a}{" "}
                against {view.mcnemar_b}), Benjamini–Hochberg adjusted within
                the stratum. ΔPrecision is hybrid minus rule-only with a 95%
                bootstrap interval; the margin is {deltas[0]?.margin ?? -0.05}.
                “n/a” means the test has no discordant pairs or precision is
                undefined for a condition.
              </p>
              <div
                role="region"
                aria-label="Paired tests"
                tabIndex={0}
                className="mt-2 overflow-x-auto"
              >
                <table className="w-full border-collapse text-row">
                  <caption className="sr-only">
                    McNemar and ΔPrecision per criterion, {stratum} stratum
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Criterion",
                        "Only hybrid correct",
                        "Only rule-only correct",
                        "p",
                        "p (BH)",
                        "ΔPrecision 95% interval",
                        "Non-inferior",
                      ].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="border-b px-3 py-2 text-left font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SC_LIST.filter((sc) =>
                      mcnemar.some((r) => r.sc === sc),
                    ).map((sc) => {
                      const t = mcnemar.find((r) => r.sc === sc);
                      const d = deltas.find((r) => r.sc === sc);
                      if (!t) return null;
                      return (
                        <tr key={sc}>
                          <th
                            scope="row"
                            className="border-b px-3 py-2 text-left font-normal"
                          >
                            <span className="font-mono text-label">{sc}</span>{" "}
                            {SC_TITLES[sc]}
                          </th>
                          <td className="border-b px-3 py-2 font-mono text-label">
                            {t.only_a_correct}
                          </td>
                          <td className="border-b px-3 py-2 font-mono text-label">
                            {t.only_b_correct}
                          </td>
                          <td className="border-b px-3 py-2 font-mono text-label">
                            {fmtP(t.p_value)}
                          </td>
                          <td className="border-b px-3 py-2 font-mono text-label">
                            {fmtP(t.p_adjusted)}
                          </td>
                          <td className="border-b px-3 py-2 font-mono text-label">
                            {d && d.low !== null && d.high !== null
                              ? `[${d.low.toFixed(3)}, ${d.high.toFixed(3)}]`
                              : "n/a"}
                          </td>
                          <td className="border-b px-3 py-2">
                            {d?.non_inferior === null || d === undefined
                              ? "n/a"
                              : d.non_inferior
                                ? "Yes"
                                : "No"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </TabsContent>
    </Tabs>
  );
}
