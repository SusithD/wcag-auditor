"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, TERMINAL } from "@/api/client";
import {
  DefinitionRows,
  Level,
  Meter,
  Panel,
  PanelBody,
  PanelHeader,
  ScCode,
  StatusShape,
} from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { useFindings, useOverview } from "@/hooks/use-report-data";
import { useCatalogue } from "@/hooks/use-run-views";
import { emphasisSegments, plainWording } from "@/lib/coverage-text";
import { SC_LIST, SC_TITLES, type Viewport } from "@/lib/report";
import {
  CHANNELS,
  type Channel,
  findingsFor,
  meterFor,
  plural,
  SC_LEVEL,
  STATE_SHAPE,
  STATE_WORD,
  stateFor,
  type Verdict,
} from "./coverage-model";
import { RunHeader } from "./run-header";
import { ViewMessage } from "./view-message";
import { useViewportParam } from "./viewport-state";

const SCOPE = "This tool checks 8 of the 86 WCAG 2.2 success criteria.";

export function CoverageScreen({ runId }: { runId: string }) {
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
  const findings = useFindings(runId, viewport);
  const catalogue = useCatalogue();

  if (run.isError) return <Message title="This run could not be loaded" />;
  if (run.data && !TERMINAL.has(run.data.status))
    return <Message title="The audit is still running" />;
  if (run.data && available.length === 0)
    return <Message title="This run has no report" />;
  if (!run.data || overview.isPending || findings.isPending || !viewport) {
    return (
      <div aria-busy="true">
        <title>Coverage - WCAG Auditor</title>
        <Skeleton className="h-64 w-full max-w-4xl" />
      </div>
    );
  }
  if (overview.isError || findings.isError)
    return <Message title="The coverage could not be loaded" />;

  const cells = Object.fromEntries(
    overview.data.coverage.map((c) => [c.sc, c]),
  );
  const verdictOf = (sc: string, channel: Channel): Verdict =>
    cells[sc]?.[`${channel}_verdict`] ?? "none";
  const reliable = (channel: Channel) =>
    SC_LIST.filter((sc) => verdictOf(sc, channel) === "automated").length;
  const any = (channel: Channel) =>
    SC_LIST.filter((sc) => {
      const v = verdictOf(sc, channel);
      return v !== "none" && v !== "not-assessable";
    }).length;
  const main: Channel = run.data.condition === "hybrid" ? "hybrid" : "rule";
  const meter = meterFor(SC_LIST.map((sc) => verdictOf(sc, main)));

  return (
    <div className="w-full">
      <RunHeader
        runId={runId}
        run={run.data}
        viewport={viewport}
        available={available}
        current="coverage"
        onViewport={setViewport}
      />

      <Panel aria-labelledby="coverage-h" className="mt-6">
        <PanelHeader
          id="coverage-h"
          title="Coverage"
          right={
            <span className="text-ink-3">
              {main === "hybrid" ? "Detector and rules" : "Rules only"} verdicts
            </span>
          }
        />
        <PanelBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Meter
              decided={meter.decided}
              review={meter.review}
              undecided={meter.undecided}
              className="w-40"
            />
            <p className="text-dense text-ink-2">
              <span className="num">{meter.decided}</span> decided,{" "}
              <span className="num">{meter.review}</span> to review,{" "}
              <span className="num">{meter.undecided}</span> could not be decided
            </p>
          </div>
          <p className="text-dense text-ink-3">
            {SCOPE}{" "}
            <Link
              href="/help"
              className="font-medium text-accent underline underline-offset-3"
            >
              What this result does not mean
            </Link>
          </p>
        </PanelBody>
      </Panel>

      <p id="coverage-caption" className="mt-6 pb-2 text-dense text-ink-2">
        Which channel returned a verdict for each criterion, and how many
        findings it produced
      </p>
      <Panel
        as="div"
        className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
        role="region"
        aria-labelledby="coverage-caption"
        tabIndex={0}
      >
        <table
          className="w-full border-collapse text-dense"
          aria-labelledby="coverage-caption"
        >
          <thead>
            <tr className="h-9 border-b border-line">
              <th
                scope="col"
                className="px-4 text-left text-xs font-medium whitespace-nowrap text-ink-3"
              >
                Success criterion
              </th>
              {CHANNELS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="px-3 text-left text-xs font-medium whitespace-nowrap text-ink-3"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SC_LIST.map((sc) => (
              <tr key={sc} className="h-12 border-b border-line">
                <th
                  scope="row"
                  className="px-4 text-left font-normal whitespace-nowrap text-ink"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>
                      <ScCode code={sc} /> {SC_TITLES[sc]}
                    </span>
                    {SC_LEVEL[sc] ? <Level level={SC_LEVEL[sc]} /> : null}
                  </span>
                </th>
                {CHANNELS.map((c) => {
                  const found = findingsFor(findings.data, sc, c.key);
                  const state = stateFor(verdictOf(sc, c.key), found);
                  return (
                    <td key={c.key} className="px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-ink">
                        <StatusShape kind={STATE_SHAPE[state]} />
                        {STATE_WORD[state]}
                      </span>
                      <span className="sr-only">, </span>
                      <span className="num ml-2 text-xs text-ink-3">
                        {plural(found.length, "finding", "findings")}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="h-10 bg-subtle">
              <th
                scope="row"
                className="px-4 text-left font-medium whitespace-nowrap text-ink"
              >
                SCs with a reliable verdict
              </th>
              {CHANNELS.map((c) => (
                <td
                  key={c.key}
                  className="num px-3 whitespace-nowrap text-ink-2"
                >
                  {reliable(c.key)} / 8 automated, {any(c.key)} / 8 with any
                  verdict
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </Panel>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-dense text-ink-2">
        {(["failed", "review", "pass", "undecided"] as const).map((state) => (
          <li key={state} className="inline-flex items-center gap-1.5">
            <StatusShape kind={STATE_SHAPE[state]} />
            {STATE_WORD[state]}
          </li>
        ))}
        <li className="text-ink-3">
          No verdict means the channel returned nothing for the criterion.
          Counts are findings on this viewport; the rule column counts findings
          the rule channel contributed to.
        </li>
      </ul>

      <section aria-labelledby="catalogue-h" className="mt-8">
        <h2 id="catalogue-h" className="t-section text-ink">
          What each criterion measures
        </h2>
        {catalogue.isPending ? (
          <p className="mt-2 text-ink-3" aria-busy="true">
            Loading the check catalogue
          </p>
        ) : catalogue.isError ? (
          <p className="mt-2 text-ink-3">
            The check catalogue is not available.
          </p>
        ) : (
          <>
            <ul className="mt-3 flex flex-col gap-2">
              {catalogue.data.entries.map((e) => (
                <li key={e.sc}>
                  <Panel as="div">
                    <details>
                      <summary className="flex min-h-10 cursor-pointer flex-wrap items-center gap-x-2 px-4 py-1.5 font-medium text-ink">
                        <ScCode code={e.sc} /> {e.name}
                        <span className="ml-auto text-dense font-normal text-ink-3">
                          Level {e.level}, {plainWording(e.detectability)}
                        </span>
                      </summary>
                      <DefinitionRows
                        className="px-4 pb-2"
                        rows={[
                          { label: "Unit", value: plainWording(e.unit) },
                          { label: "Inputs", value: plainWording(e.inputs) },
                          {
                            label: "Decision procedure",
                            value: plainWording(e.procedure),
                          },
                          {
                            label: "Threshold or rule",
                            value: plainWording(e.threshold),
                          },
                          {
                            label: "Tier when input present",
                            value: plainWording(e.tier),
                          },
                          {
                            label: "ACT or axe rule",
                            value: plainWording(e.act),
                          },
                        ]}
                      />
                    </details>
                  </Panel>
                </li>
              ))}
            </ul>
            {catalogue.data.coverage_claim ? (
              <p className="mt-3 text-dense text-ink-3">
                {emphasisSegments(
                  plainWording(catalogue.data.coverage_claim),
                ).map((seg) =>
                  seg.strong ? (
                    <strong key={seg.at}>{seg.text}</strong>
                  ) : (
                    <span key={seg.at}>{seg.text}</span>
                  ),
                )}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function Message({ title }: { title: string }) {
  return <ViewMessage title={title} view="Coverage" />;
}
