"use client";

import { useQuery } from "@tanstack/react-query";
import { api, TERMINAL } from "@/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFindings, useOverview } from "@/hooks/use-report-data";
import { useCatalogue } from "@/hooks/use-run-views";
import { type Finding, SC_LIST, SC_TITLES, type Viewport } from "@/lib/report";
import { RunNav } from "./run-nav";
import { useViewportParam } from "./viewport-state";

const VERDICT = {
  automated: { glyph: "●", text: "Automated verdict" },
  "needs-review": { glyph: "◇", text: "Needs review" },
  "not-assessable": { glyph: "—", text: "Not assessable" },
  none: { glyph: "○", text: "No verdict" },
} as const;

type Channel = "rule" | "pixel" | "hybrid";
const CHANNELS: { key: Channel; label: string }[] = [
  { key: "rule", label: "Rule channel" },
  { key: "pixel", label: "Pixel channel" },
  { key: "hybrid", label: "Hybrid" },
];

function countFor(findings: Finding[], sc: string, channel: Channel) {
  return findings.filter(
    (f) =>
      f.sc === sc &&
      (channel === "hybrid" ||
        f.provenance === "both" ||
        (channel === "rule"
          ? f.provenance === "rule"
          : f.provenance === "pixel")),
  ).length;
}

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
      <div className="p-6" aria-busy="true">
        <Skeleton className="h-64 w-full max-w-4xl" />
      </div>
    );
  }
  if (overview.isError || findings.isError)
    return <Message title="The coverage could not be loaded" />;

  const cells = Object.fromEntries(
    overview.data.coverage.map((c) => [c.sc, c]),
  );
  const reliable = (channel: Channel) =>
    overview.data.coverage.filter(
      (c) => c[`${channel}_verdict`] === "automated",
    ).length;
  const any = (channel: Channel) =>
    overview.data.coverage.filter(
      (c) =>
        c[`${channel}_verdict`] !== "none" &&
        c[`${channel}_verdict`] !== "not-assessable",
    ).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <title>{`Coverage - ${overview.data.url}`}</title>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold">Coverage</h1>
          <p className="font-mono text-label text-muted-foreground">
            {overview.data.url}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RunNav runId={runId} current="coverage" query={`?vp=${viewport}`} />
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

      <div
        className="mt-4 overflow-x-auto"
        role="region"
        aria-label="Coverage grid"
        tabIndex={0}
      >
        <table className="w-full border-collapse text-row">
          <caption className="pb-2 text-left text-caption text-muted-foreground">
            Which channel returned a verdict for each criterion, and how many
            findings it produced
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b px-3 py-2 text-left font-medium"
              >
                Success criterion
              </th>
              {CHANNELS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="border-b px-3 py-2 text-left font-medium"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SC_LIST.map((sc) => (
              <tr key={sc}>
                <th
                  scope="row"
                  className="border-b px-3 py-2 text-left font-normal"
                >
                  <span className="font-mono text-label">{sc}</span>{" "}
                  {SC_TITLES[sc]}
                </th>
                {CHANNELS.map((c) => {
                  const verdict = cells[sc]?.[`${c.key}_verdict`] ?? "none";
                  const v = VERDICT[verdict];
                  return (
                    <td key={c.key} className="border-b px-3 py-2">
                      <span aria-hidden="true">{v.glyph}</span> {v.text}
                      <span className="ml-2 font-mono text-label text-muted-foreground">
                        {countFor(findings.data, sc, c.key)} findings
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="px-3 py-2 text-left">
                SCs with a reliable verdict
              </th>
              {CHANNELS.map((c) => (
                <td key={c.key} className="px-3 py-2 font-mono text-label">
                  {reliable(c.key)} / 8 automated, {any(c.key)} / 8 with any
                  verdict
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-caption text-muted-foreground">
        Legend: ● automated verdict · ◇ needs review · — not assessable · ○ no
        verdict. Counts are findings on this viewport; the rule column counts
        findings the rule channel contributed to.
      </p>

      <section aria-labelledby="catalogue-h" className="mt-8">
        <h2 id="catalogue-h" className="text-h3 font-semibold">
          What each criterion measures
        </h2>
        {catalogue.isPending ? (
          <p className="mt-2 text-body text-muted-foreground" aria-busy="true">
            Loading the check catalogue
          </p>
        ) : catalogue.isError ? (
          <p className="mt-2 text-body text-muted-foreground">
            The check catalogue is not available.
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-2">
              {catalogue.data.entries.map((e) => (
                <li key={e.sc} className="rounded-lg border bg-card">
                  <details className="group">
                    <summary className="flex min-h-9 cursor-pointer items-center gap-2 px-3 text-body font-medium">
                      <span className="font-mono text-label">{e.sc}</span>{" "}
                      {e.name}
                      <span className="ml-auto text-caption font-normal text-muted-foreground">
                        Level {e.level}, {e.detectability}
                      </span>
                    </summary>
                    <dl className="grid gap-2 px-3 pb-3 text-body sm:grid-cols-2">
                      <Row label="Unit" value={e.unit} />
                      <Row label="Inputs" value={e.inputs} />
                      <Row
                        label="Decision procedure"
                        value={e.procedure}
                        wide
                      />
                      <Row label="Threshold or rule" value={e.threshold} wide />
                      <Row label="Tier when input present" value={e.tier} />
                      <Row label="ACT or axe rule" value={e.act} />
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
            {catalogue.data.coverage_claim ? (
              <p className="mt-3 text-caption text-muted-foreground">
                {catalogue.data.coverage_claim}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Message({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-160 px-6 py-12">
      <h1 className="text-h2 font-semibold">{title}</h1>
    </div>
  );
}
