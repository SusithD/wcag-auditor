"use client";

import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDetectorEval } from "@/hooks/use-eval";
import {
  apAxisMax,
  boxAndClassLens,
  classLabel,
  type DetectorEval,
  joinWords,
  percent,
  rareClasses,
  score,
} from "@/lib/detector";
import { ChartPanel } from "./eval-chart";

const BAR_TICKS = 5;

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Panel className="p-4">
      <div className="text-label font-medium text-ink-3">{label}</div>
      <div className="num mt-1 text-2xl/8 font-semibold text-ink">{value}</div>
      <p className="mt-1 text-dense text-ink-2">{note}</p>
    </Panel>
  );
}

function describeAp(detector: DetectorEval): string {
  return `Average precision at IoU 0.50 to 0.95 by class: ${detector.per_class
    .map((c) => `${classLabel(c.name)} ${score(c.ap_50_95)}`)
    .join(", ")}.`;
}

function ApChart({ detector }: { detector: DetectorEval }) {
  const max = apAxisMax(detector.per_class.map((c) => c.ap_50_95));
  const W = 1000;
  const X0 = 150;
  const PW = 700;
  const TOP = 30;
  const RH = 40;
  const H = TOP + RH * detector.per_class.length + 4;
  const x = (v: number) => X0 + (PW * v) / max;
  const ticks = Array.from(
    { length: BAR_TICKS + 1 },
    (_, i) => (max * i) / BAR_TICKS,
  );
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={describeAp(detector)}
      className="block h-auto w-full min-w-120 font-sans"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text x={0} y={16} className="fill-ink-3 text-[11.5px] font-medium">
        Class
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={x(t)}
            x2={x(t)}
            y1={TOP - 4}
            y2={H - 4}
            stroke="var(--line)"
          />
          <text
            x={x(t)}
            y={16}
            textAnchor="middle"
            className="num fill-ink-3 text-[11.5px]"
          >
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      {detector.per_class.map((c, i) => {
        const y = TOP + i * RH;
        return (
          <g key={c.name}>
            <text
              x={0}
              y={y + 24}
              className="fill-ink text-[13.5px] font-medium"
            >
              {classLabel(c.name)}
            </text>
            <rect
              x={X0}
              y={y + 9}
              width={x(c.ap_50_95) - X0}
              height={22}
              fill="var(--accent)"
            />
            <text
              x={x(c.ap_50_95) + 8}
              y={y + 25}
              className="num fill-ink text-[13.5px] font-semibold"
            >
              {score(c.ap_50_95)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MeasureNotes({ detector }: { detector: DetectorEval }) {
  const rare = rareClasses(detector);
  const noise = boxAndClassLens(detector.label_noise);
  const items = [
    "Single-image inference, each image squashed to 576 by 576. This is not the accuracy of the tiled pipeline.",
    "The split is held-out WebUI validation, not the 110-page benchmark.",
    noise
      ? `Training and validation labels are roughly ${percent(noise.noise_rate, 0)} noisy by the box-and-class test, so these scores are a lower bound.`
      : null,
    rare
      ? `${joinWords(rare.names.map(classLabel))} had ${rare.boxes} ${rare.boxes === 1 ? "box" : "boxes"} between them in the noise sample, so their noise is unmeasured.`
      : null,
    "Per-class box counts for the split are not recorded in the report.",
  ].filter((item): item is string => item !== null);
  return (
    <Panel aria-labelledby="det-measure-h">
      <PanelHeader id="det-measure-h" as="h3" title="What this measures" />
      <PanelBody className="px-4 py-3">
        <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-dense text-ink-2">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}

function LabelNoisePanel({ detector }: { detector: DetectorEval }) {
  const noise = detector.label_noise;
  if (!noise) return null;
  return (
    <Panel aria-labelledby="noise-t">
      <PanelHeader
        id="noise-t"
        as="h3"
        title={`Label-noise check, ${noise.sample_size} boxes`}
        right="Share failing, 95% interval"
      />
      <Table regionLabel="Label-noise check">
        <caption className="sr-only">
          Share of {noise.sample_size} sampled training labels that fail each
          test
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Question asked of each box</TableHead>
            <TableHead scope="col" className="text-right">
              Judged correct
            </TableHead>
            <TableHead scope="col" className="text-right">
              Noise rate
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {noise.lenses.map((lens) => (
            <TableRow key={lens.lens}>
              <TableHead scope="row" className="font-normal text-ink">
                {lens.question}
              </TableHead>
              <TableCell className="text-right">
                <span className="num">
                  {lens.correct} of {noise.sample_size}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span className="num text-ink">{percent(lens.noise_rate)}</span>{" "}
                <span className="num text-ink-3">
                  ±{(lens.ci_half_width * 100).toFixed(1)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t border-line px-4 py-3 text-dense text-ink-2">
        {noise.reviewer}. The sample follows box frequency:{" "}
        {noise.sample_classes
          .map((c) => `${classLabel(c.name).toLowerCase()} ${c.boxes}`)
          .join(", ")}
        .
      </p>
    </Panel>
  );
}

function DetectorBody({ detector }: { detector: DetectorEval }) {
  const noise = boxAndClassLens(detector.label_noise);
  const split = `${detector.images.toLocaleString("en-GB")} images and ${detector.ground_truth_boxes.toLocaleString("en-GB")} boxes`;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          label="mAP 50:95"
          value={score(detector.map_50_95)}
          note={`ONNX on CPU, WebUI validation split, ${split}.`}
        />
        <Stat
          label="mAP 50"
          value={score(detector.map_50)}
          note="Same model and split."
        />
        {noise ? (
          <Stat
            label="Label noise"
            value={percent(noise.noise_rate)}
            note={`Of ${detector.label_noise?.sample_size} sampled boxes, the share with a wrong box or class. 95% interval ±${(noise.ci_half_width * 100).toFixed(1)}.`}
          />
        ) : (
          <Stat
            label="Label noise"
            value="n/a"
            note="No label-noise check is available."
          />
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ChartPanel
          title="Average precision by class"
          chart={<ApChart detector={detector} />}
          note={`AP 50:95. Bars start at 0 and the scale ends at ${apAxisMax(detector.per_class.map((c) => c.ap_50_95)).toFixed(1)}.`}
          table={
            <Table regionLabel="Average precision by class">
              <caption className="sr-only">
                Average precision by class at IoU 0.50 to 0.95
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Class</TableHead>
                  <TableHead scope="col" className="text-right">
                    AP 50:95
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detector.per_class.map((c) => (
                  <TableRow key={c.name}>
                    <TableHead scope="row" className="font-normal text-ink">
                      {classLabel(c.name)}
                    </TableHead>
                    <TableCell className="text-right">
                      <span className="num text-ink">{score(c.ap_50_95)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
        <MeasureNotes detector={detector} />
      </div>
      <LabelNoisePanel detector={detector} />
    </>
  );
}

export function DetectorSection() {
  const detector = useDetectorEval();
  return (
    <section aria-labelledby="det-h" className="mt-8">
      <div className="mb-3 max-w-[78ch]">
        <h2 id="det-h" className="t-section text-ink">
          How well does the element detector find elements?
        </h2>
        <p className="mt-1 text-ink-2">
          The detector is weak on small and ambiguous elements. Findings that
          depend on it are marked as needing review.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {detector.isPending ? (
          <div aria-busy="true">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detector.isError ? (
          <Panel>
            <EmptyState title="The detector evaluation could not be loaded">
              Reload the page to try again.
            </EmptyState>
          </Panel>
        ) : detector.data ? (
          <DetectorBody detector={detector.data} />
        ) : (
          <Panel>
            <EmptyState title="No detector evaluation to show">
              The detector report is not in this checkout, so its scores are not
              shown.
            </EmptyState>
          </Panel>
        )}
      </div>
    </section>
  );
}
