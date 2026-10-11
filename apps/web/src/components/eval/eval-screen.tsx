"use client";

import { Download } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  EmptyState,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  ScCode,
  StatusShape,
} from "@/components/ds";
import { PageCrumbs } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  progressFraction,
  STRATA,
  STRATUM_LABEL,
  type Stratum,
} from "@/lib/eval";
import { SC_LIST, SC_TITLES } from "@/lib/report";
import { cn } from "@/lib/utils";
import { ChartPanel, PrecisionChart, RecallChart } from "./eval-chart";
import {
  interval,
  limitItems,
  MIN_INFORMATIVE_N,
  type PairVerdict,
  pairVerdict,
  precisionLead,
  precisionRows,
  precisionVerdict,
  recallLead,
  recallRows,
  seriesFor,
  signed,
  signedInterval,
} from "./eval-model";

const PAGE_SET: Record<Stratum, string> = {
  real: "Real pages",
  synthetic: "Synthetic",
  combined: "Combined",
};

const COUNT_TERMS: Record<string, string> = {
  TP: "True positives: findings that match the ground truth",
  FP: "False positives: findings with no match in the ground truth",
  FN: "False negatives: ground-truth findings that were missed",
  Dup: "Duplicates: extra reports of a finding already matched",
};

const SHORT_SHA = 12;

export function EvalScreen() {
  const list = useEvalList();
  const [chosen, setChosen] = useState<number | undefined>();
  const evalId = chosen ?? list.data?.[0]?.id;
  const detail = useEvalDetail(evalId);
  const start = useStartEval();
  const [stratum, setStratum] = useState<Stratum>("real");
  const [condition, setCondition] = useState<string | null>(null);

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

  const exportLink = (href: string, label: string, scope: string) => (
    <a className={buttonVariants({ variant: "default" })} href={href} download>
      <Download aria-hidden="true" />
      {label}
      <span className="sr-only"> {scope}</span>
    </a>
  );

  return (
    <div className="w-full">
      <title>Evaluation - WCAG Auditor</title>
      <PageCrumbs items={[{ label: "Research" }, { label: "Evaluation" }]} />
      <PageHeader
        title="Evaluation"
        description={
          <span className="block max-w-xl">
            How well each criterion is detected on the frozen benchmark, and
            whether the detector helps.
          </span>
        }
        actions={
          <>
            {view ? (
              <ToggleGroup
                variant="outline"
                value={[stratum]}
                onValueChange={(v) => v[0] && setStratum(v[0] as Stratum)}
                aria-label="Page set"
              >
                {STRATA.map((s) => (
                  <ToggleGroupItem key={s} value={s}>
                    {PAGE_SET[s]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : null}
            {view && evalId !== undefined && activeCondition
              ? exportLink(
                  `/api/eval/${evalId}/export.csv?condition=${activeCondition}&stratum=${stratum}`,
                  "Export CSV",
                  `for the ${CONDITION_LABEL[activeCondition] ?? activeCondition} condition, ${STRATUM_LABEL[stratum].toLowerCase()} stratum`,
                )
              : null}
            {view && evalId !== undefined
              ? exportLink(
                  `/api/eval/${evalId}/export.tex`,
                  "Export LaTeX",
                  "of all conditions",
                )
              : null}
            <Button
              variant="primary"
              onClick={() => {
                if (!running && !start.isPending)
                  start.mutate(["rule_only", "pixel", "hybrid"]);
              }}
              aria-disabled={running || start.isPending}
              className="aria-disabled:opacity-60"
            >
              {running ? "Evaluation running" : "Run evaluation"}
            </Button>
          </>
        }
      />
      <p className="-mt-2 mb-4 text-dense text-ink-3">
        Hybrid is Detector and rules; rule-only is Rules only.
      </p>

      {start.isError ? (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 text-dense text-ink"
        >
          <StatusShape kind="alert" />
          {start.error.message}
        </p>
      ) : null}

      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
      {running && summary ? (
        <Panel className="mb-4 p-4">
          <p className="text-body text-ink">
            {summary.total
              ? `Scoring capture ${summary.done ?? 0} of ${summary.total}`
              : "Starting the evaluation"}
          </p>
          <Progress
            value={progressFraction(summary.done, summary.total)}
            aria-label="Evaluation progress"
            className="mt-2"
          />
        </Panel>
      ) : null}

      {list.isPending ? (
        <div aria-busy="true">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : list.isError ? (
        <EmptyState title="The evaluations could not be loaded">
          Reload the page to try again.
        </EmptyState>
      ) : list.data.length === 0 ? (
        <Panel>
          <EmptyState title="No results to show">
            No evaluation has been run yet. Run one to score the benchmark
            against the sealed ground truth.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label htmlFor="eval-pick" className="text-dense font-medium">
              Evaluation
            </label>
            <select
              id="eval-pick"
              value={evalId}
              onChange={(e) => setChosen(Number(e.target.value))}
              className="h-8 rounded-md border border-line-control bg-surface px-2 text-dense text-ink"
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
            <p
              role="alert"
              className="mb-4 flex items-center gap-2 text-dense text-ink"
            >
              <StatusShape kind="failed" />
              This evaluation failed: {summary.error}
            </p>
          ) : null}

          {detail.isPending && summary?.status === "done" ? (
            <div aria-busy="true">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : null}

          {view && activeCondition ? (
            <Results
              view={view}
              summary={summary}
              stratum={stratum}
              condition={activeCondition}
              onCondition={setCondition}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <div className="mb-3 max-w-[78ch]">
        <h2 id={id} className="t-section text-ink">
          {title}
        </h2>
        {lead ? <p className="mt-1 text-ink-2">{lead}</p> : null}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Num({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span className={cn("num", muted ? "text-ink-3" : "text-ink")}>
      {children}
    </span>
  );
}

function VerdictMark({ kind }: { kind: PairVerdict["kind"] }) {
  if (kind === "a")
    return (
      <svg width="12" height="12" aria-hidden="true">
        <circle cx="6" cy="6" r="5" fill="var(--accent)" />
      </svg>
    );
  if (kind === "b")
    return (
      <svg width="12" height="12" aria-hidden="true">
        <circle
          cx="6"
          cy="6"
          r="4.2"
          fill="var(--surface)"
          stroke="var(--ink-2)"
          strokeWidth="2"
        />
      </svg>
    );
  return (
    <svg width="12" height="12" aria-hidden="true">
      <line
        x1="2"
        x2="10"
        y1="6"
        y2="6"
        stroke="var(--ink-3)"
        strokeWidth="2"
      />
    </svg>
  );
}

function CriterionCell({ sc }: { sc: string }) {
  return (
    <TableHead scope="row" className="text-ink">
      <ScCode code={sc} />
      <span className="ml-2 font-normal">{SC_TITLES[sc]}</span>
    </TableHead>
  );
}

function Results({
  view,
  summary,
  stratum,
  condition,
  onCondition,
}: {
  view: EvalView;
  summary: { id: number; source: string; created_at: string } | undefined;
  stratum: Stratum;
  condition: string;
  onCondition: (c: string) => void;
}) {
  const m = view.meta;
  const series = seriesFor(m.conditions);
  const names = SC_TITLES;
  const stratumWord = STRATUM_LABEL[stratum].toLowerCase();
  const recall = recallRows(view, stratum, series);
  const nameA = view.mcnemar_a ?? "hybrid";
  const nameB = view.mcnemar_b ?? "rule_only";
  const labelA = CONDITION_LABEL[nameA] ?? nameA;
  const labelB = CONDITION_LABEL[nameB] ?? nameB;
  const mcnemar = view.mcnemar.filter((r) => r.stratum === stratum);
  const precision = precisionRows(view, stratum, nameA, nameB);
  const margin = precision[0]?.margin ?? -0.05;
  const paired = mcnemar.length > 0;
  const cells = cellsFor(view, condition, stratum);
  const limits = limitItems(view, stratum, series);

  const repro: [string, ReactNode][] = [
    ["Run", summary ? `#${summary.id}` : ""],
    ["Benchmark sha", m.benchmark_sha?.slice(0, SHORT_SHA) ?? "n/a"],
    ["Truth sha", m.truth_sha?.slice(0, SHORT_SHA) ?? "n/a"],
    ["Protocol sha", m.protocol_sha?.slice(0, SHORT_SHA) ?? "n/a"],
    ["Seed", String(m.seed)],
    ["Bootstrap", m.resamples.toLocaleString("en-GB")],
    [
      "Captures scored",
      `${m.items_scored} (${m.items_unlabelled} without truth)`,
    ],
  ];

  return (
    <>
      <Panel
        aria-labelledby="repro-h"
        className="flex flex-wrap gap-x-8 gap-y-3 px-4 py-3"
      >
        <h2 id="repro-h" className="t-eyebrow self-center">
          Reproduce
        </h2>
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-3">
          {repro.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium text-ink-3">{k}</dt>
              <dd className="m-0 font-mono text-label text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel
        aria-labelledby="how-h"
        className="mt-4 grid md:grid-cols-3 [&>div]:border-line [&>div]:px-4 [&>div]:py-3 max-md:[&>div+div]:border-t md:[&>div+div]:border-l"
      >
        <h2 id="how-h" className="sr-only">
          How to read this
        </h2>
        <div>
          <h3 className="t-eyebrow">Marks</h3>
          <p className="mt-1 text-dense text-ink-2">
            Filled navy is the hybrid, hollow grey is rule-only and a grey
            square is the pixel channel alone. n is the number of true failures
            in the truth data.
          </p>
        </div>
        <div>
          <h3 className="t-eyebrow">Intervals</h3>
          <p className="mt-1 text-dense text-ink-2">
            Lines are 95% bootstrap intervals from{" "}
            {m.resamples.toLocaleString("en-GB")} resamples. Intervals from
            fewer than {MIN_INFORMATIVE_N} pages are wide; read them with care.
          </p>
        </div>
        <div>
          <h3 className="t-eyebrow">Verdicts</h3>
          <p className="mt-1 text-dense text-ink-2">
            Words come from the paired exact test (Benjamini-Hochberg adjusted)
            and a precision margin of {signed(margin, 2)}.
          </p>
        </div>
      </Panel>

      <Section
        id="q1-h"
        title={
          paired
            ? `Question 1: does the ${labelA.toLowerCase()} find failures that ${labelB.toLowerCase()} cannot?`
            : "Question 1: how many failures does the audit find?"
        }
        lead={recallLead(view, series)}
      >
        <ChartPanel
          title={`Recall by criterion, ${stratumWord} stratum`}
          chart={
            <RecallChart
              rows={recall}
              series={series}
              stratum={stratum}
              names={names}
            />
          }
          table={
            <Table regionLabel="Recall by criterion">
              <caption className="sr-only">
                Recall by criterion on the {stratumWord} stratum
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Criterion</TableHead>
                  <TableHead scope="col" className="text-right">
                    Failures (n)
                  </TableHead>
                  {series.map((c) => (
                    <TableHead key={c} scope="col">
                      {CONDITION_LABEL[c] ?? c} recall [95% interval]
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recall.map((row) => (
                  <TableRow key={row.sc}>
                    <CriterionCell sc={row.sc} />
                    <TableCell className="text-right">
                      <Num>{row.n.toLocaleString("en-GB")}</Num>
                    </TableCell>
                    {row.lanes.map((lane) => (
                      <TableCell key={lane.condition}>
                        {lane.state === "value" && lane.value !== null ? (
                          <>
                            <Num>{lane.value.toFixed(3)}</Num>{" "}
                            <Num muted>{interval(lane.ci)}</Num>
                            {lane.ciShown ? null : (
                              <div className="text-xs text-ink-3">
                                interval not informative at this sample size
                              </div>
                            )}
                          </>
                        ) : lane.state === "cannot-decide" ? (
                          <span className="text-ink-2">
                            {CONDITION_LABEL[lane.condition]} cannot decide this
                            criterion
                          </span>
                        ) : (
                          <span className="text-ink-3">n/a</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />

        {paired ? (
          <Panel aria-labelledby="mc-t">
            <PanelHeader
              id="mc-t"
              as="h3"
              title={`Paired comparison, ${stratumWord} stratum`}
              right="Exact McNemar, Benjamini-Hochberg adjusted"
            />
            <Table regionLabel="Paired comparison">
              <caption className="sr-only">
                Paired comparison of {labelA} and {labelB} on the {stratumWord}{" "}
                stratum, exact McNemar test
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Criterion</TableHead>
                  <TableHead scope="col" className="text-right">
                    Only {labelA} right
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Only {labelB} right
                  </TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Balance</span>
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    p (BH)
                  </TableHead>
                  <TableHead scope="col">Verdict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SC_LIST.map((sc) => {
                  const t = mcnemar.find((r) => r.sc === sc);
                  if (!t) return null;
                  const verdict = pairVerdict(
                    t.only_a_correct,
                    t.only_b_correct,
                    t.p_adjusted,
                    labelA,
                    labelB,
                  );
                  const total = t.only_a_correct + t.only_b_correct;
                  return (
                    <TableRow key={sc}>
                      <CriterionCell sc={sc} />
                      <TableCell className="text-right">
                        <Num>{t.only_a_correct.toLocaleString("en-GB")}</Num>
                      </TableCell>
                      <TableCell className="text-right">
                        <Num>{t.only_b_correct.toLocaleString("en-GB")}</Num>
                      </TableCell>
                      <TableCell>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-1.5 w-28 gap-0.5 overflow-hidden rounded-sm bg-track",
                            total === 0 && "opacity-50",
                          )}
                        >
                          {total > 0 ? (
                            <>
                              <i
                                className="block h-full bg-accent"
                                style={{
                                  width: `${(t.only_a_correct / total) * 100}%`,
                                }}
                              />
                              <b
                                className="block h-full bg-line-strong"
                                style={{
                                  width: `${(t.only_b_correct / total) * 100}%`,
                                }}
                              />
                            </>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Num>
                          {t.p_adjusted === null
                            ? "n/a"
                            : t.p_adjusted < 0.001
                              ? "<0.001"
                              : t.p_adjusted.toFixed(3)}
                        </Num>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <VerdictMark kind={verdict.kind} />
                          {verdict.words}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="border-t border-line px-4 py-3 text-dense text-ink-2">
              Exact McNemar test on paired per-unit outcomes ({nameA} against{" "}
              {nameB}). A unit counts as right when its outcome matches the
              truth data, so a count in the only-right columns can be a failure
              found or a false alarm avoided.
            </p>
          </Panel>
        ) : (
          <p className="text-body text-ink-2">
            This evaluation compared a single condition, so there is no paired
            test.
          </p>
        )}
      </Section>

      {paired ? (
        <Section
          id="q2-h"
          title="Question 2: is precision kept?"
          lead={precisionLead(precision)}
        >
          <ChartPanel
            title={`Precision difference, ${labelA} minus ${labelB}, ${stratumWord} stratum`}
            chart={
              <PrecisionChart
                rows={precision}
                stratum={stratum}
                names={names}
                labelA={labelA}
                labelB={labelB}
              />
            }
            note={`Point is the ${labelA} precision minus the ${labelB} precision. Intervals are the paired bootstrap intervals. The margin is ${signed(margin, 2)}.`}
            table={
              <Table regionLabel="Precision difference">
                <caption className="sr-only">
                  Precision on the {stratumWord} stratum and the paired
                  difference against the {signed(margin, 2)} margin
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Criterion</TableHead>
                    <TableHead scope="col">
                      {labelA} precision [95% interval]
                    </TableHead>
                    <TableHead scope="col">
                      {labelB} precision [95% interval]
                    </TableHead>
                    <TableHead scope="col">Difference [95% interval]</TableHead>
                    <TableHead scope="col">Non-inferior</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {precision.map((r) => {
                    const verdict = precisionVerdict(r);
                    return (
                      <TableRow key={r.sc}>
                        <CriterionCell sc={r.sc} />
                        <TableCell>
                          {r.precisionA === null ? (
                            <span className="text-ink-3">n/a</span>
                          ) : (
                            <>
                              <Num>{r.precisionA.toFixed(3)}</Num>{" "}
                              <Num muted>{interval(r.ciA)}</Num>
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.precisionB === null ? (
                            <span className="text-ink-3">n/a</span>
                          ) : (
                            <>
                              <Num>{r.precisionB.toFixed(3)}</Num>{" "}
                              <Num muted>{interval(r.ciB)}</Num>
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.low !== null && r.high !== null ? (
                            <Num>
                              {r.point === null ? "" : `${signed(r.point)} `}
                              {signedInterval(r.low, r.high)}
                            </Num>
                          ) : (
                            <span className="text-ink-3">not estimable</span>
                          )}
                        </TableCell>
                        <TableCell>{verdict.word}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
          />
        </Section>
      ) : null}

      <Section
        id="all-h"
        title="All results by criterion"
        lead="Counts, precision, recall and F1 for one condition, with 95% bootstrap intervals over pages."
      >
        <Panel aria-labelledby="all-t">
          <PanelHeader
            id="all-t"
            as="h3"
            title={`${CONDITION_LABEL[condition] ?? condition}, ${stratumWord} stratum`}
            right={
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
            }
          />
          <Table regionLabel="Per-criterion results">
            <caption className="sr-only">
              Per-criterion results for {CONDITION_LABEL[condition]} on the{" "}
              {stratum} stratum
            </caption>
            <TableHeader>
              <TableRow>
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
                  <TableHead key={h} scope="col">
                    {COUNT_TERMS[h] ? (
                      <abbr title={COUNT_TERMS[h]}>{h}</abbr>
                    ) : (
                      h
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cells.map((c) => (
                <TableRow key={c.sc}>
                  <CriterionCell sc={c.sc} />
                  <TableCell>
                    <Num>{c.tp}</Num>
                  </TableCell>
                  <TableCell>
                    <Num>{c.fp}</Num>
                  </TableCell>
                  <TableCell>
                    <Num>{c.fn}</Num>
                  </TableCell>
                  <TableCell>
                    <Num>{c.duplicates}</Num>
                  </TableCell>
                  <TableCell>
                    <Num>{fmt(c.precision)}</Num>{" "}
                    <Num muted>{fmtCi(c.precision_ci)}</Num>
                  </TableCell>
                  <TableCell>
                    <Num>{fmt(c.recall)}</Num>{" "}
                    <Num muted>{fmtCi(c.recall_ci)}</Num>
                  </TableCell>
                  <TableCell>
                    <Num>{fmt(c.f1)}</Num> <Num muted>{fmtCi(c.f1_ci)}</Num>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t border-line px-4 py-3 text-dense text-ink-2">
            TP true positives, FP false positives, FN missed findings, Dup
            duplicate reports of one finding.
          </p>
        </Panel>
      </Section>

      <section aria-labelledby="lim-h" className="mt-8">
        <h2 id="lim-h" className="t-section mb-3 text-ink">
          Limits
        </h2>
        <Panel>
          <PanelBody className="px-4 py-2">
            <ul className="m-0 list-none p-0">
              {limits.map((item) => (
                <li
                  key={item.lead}
                  className="grid grid-cols-[16px_1fr] gap-2.5 border-b border-line py-3 text-dense text-ink-2 last:border-b-0"
                >
                  <span className="mt-1">
                    <StatusShape kind={item.shape} />
                  </span>
                  <span className="max-w-[110ch]">
                    <b className="font-semibold text-ink">{item.lead}</b>{" "}
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      </section>
    </>
  );
}
