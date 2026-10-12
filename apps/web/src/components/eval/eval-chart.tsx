"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "@/components/ds";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CONDITION_LABEL } from "@/lib/eval";
import {
  axisRange,
  describePrecision,
  describeRecall,
  interval,
  MIN_INFORMATIVE_N,
  type PrecisionRow,
  precisionVerdict,
  type RecallRow,
  signed,
  signedInterval,
} from "./eval-model";

const KNOCKOUT = {
  paintOrder: "stroke",
  stroke: "var(--surface)",
  strokeWidth: 5,
  strokeLinejoin: "round",
} as const;

function ScrollRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
      {...(scrolls ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}

export function ChartPanel({
  title,
  chart,
  table,
  note,
  right,
}: {
  title: string;
  chart: ReactNode;
  table: ReactNode;
  note?: ReactNode;
  right?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();
  return (
    <Panel aria-labelledby={`${id}-t`}>
      <PanelHeader
        id={`${id}-t`}
        as="h3"
        title={title}
        right={
          <>
            {right}
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[view]}
              onValueChange={(v) => v[0] && setView(v[0] as "chart" | "table")}
              aria-label={`${title} view`}
            >
              <ToggleGroupItem value="chart">Chart</ToggleGroupItem>
              <ToggleGroupItem value="table">Table</ToggleGroupItem>
            </ToggleGroup>
          </>
        }
      />
      {view === "chart" ? (
        <PanelBody>
          <ScrollRegion label={`${title}, chart`}>{chart}</ScrollRegion>
          {note ? <p className="mt-2 text-label text-ink-3">{note}</p> : null}
        </PanelBody>
      ) : (
        table
      )}
    </Panel>
  );
}

function Mark({
  condition,
  x,
  y,
  size = 5,
}: {
  condition: string;
  x: number;
  y: number;
  size?: number;
}) {
  if (condition === "hybrid")
    return <circle cx={x} cy={y} r={size + 0.5} fill="var(--accent)" />;
  if (condition === "rule_only")
    return (
      <circle
        cx={x}
        cy={y}
        r={size - 0.6}
        fill="var(--surface)"
        stroke="var(--ink-2)"
        strokeWidth={2}
      />
    );
  return (
    <rect
      x={x - size + 0.5}
      y={y - size + 0.5}
      width={(size - 0.5) * 2}
      height={(size - 0.5) * 2}
      fill="var(--ink-2)"
    />
  );
}

function Whisker({
  x1,
  x2,
  y,
  strong,
  cap = 4,
}: {
  x1: number;
  x2: number;
  y: number;
  strong: boolean;
  cap?: number;
}) {
  const stroke = strong ? "var(--accent)" : "var(--ink-2)";
  const width = strong ? 2 : 1.5;
  return (
    <g stroke={stroke} strokeWidth={width}>
      <line x1={x1} x2={x2} y1={y} y2={y} />
      <line x1={x1} x2={x1} y1={y - cap} y2={y + cap} />
      <line x1={x2} x2={x2} y1={y - cap} y2={y + cap} />
    </g>
  );
}

export function Legend({ series }: { series: string[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-dense text-ink-2">
      {series.map((c) => (
        <li key={c} className="inline-flex items-center gap-2">
          <svg width="16" height="12" aria-hidden="true">
            <line
              x1="0"
              x2="16"
              y1="6"
              y2="6"
              stroke={c === "hybrid" ? "var(--accent)" : "var(--ink-2)"}
              strokeWidth="1.5"
            />
            <Mark condition={c} x={8} y={6} size={4.4} />
          </svg>
          {CONDITION_LABEL[c] ?? c}
        </li>
      ))}
      <li className="inline-flex items-center gap-2">
        <svg width="16" height="12" aria-hidden="true">
          <g stroke="var(--ink-2)" strokeWidth="1.5">
            <line x1="1" x2="15" y1="6" y2="6" />
            <line x1="1" x2="1" y1="2" y2="10" />
            <line x1="15" x2="15" y1="2" y2="10" />
          </g>
        </svg>
        95% interval
      </li>
    </ul>
  );
}

const SERIES_LABEL = (c: string) => CONDITION_LABEL[c] ?? c;

export function RecallChart({
  rows,
  series,
  stratum,
  names,
}: {
  rows: RecallRow[];
  series: string[];
  stratum: string;
  names: Record<string, string>;
}) {
  const W = 1000;
  const PX0 = 372;
  const PW = 340;
  const TOP = 32;
  const RX = 742;
  const lanes = series.length;
  const RH = 26 + lanes * 22;
  const H = TOP + RH * rows.length + 6;
  const x = (v: number) => PX0 + PW * v;
  const cannot = (c: string) =>
    `${SERIES_LABEL(c)} cannot decide this criterion`;

  return (
    <>
      <Legend series={series} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={describeRecall(rows, series, stratum)}
        className="block h-auto w-full min-w-200 font-sans"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text x={0} y={16} className="fill-ink-3 text-[11.5px] font-medium">
          Criterion and failures in truth (n)
        </text>
        <text x={RX} y={16} className="fill-ink-3 text-[11.5px] font-medium">
          Recall [95% interval]
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line
              x1={x(v)}
              x2={x(v)}
              y1={TOP - 4}
              y2={H - 4}
              stroke="var(--line)"
            />
            <text
              x={x(v)}
              y={16}
              textAnchor="middle"
              className="num fill-ink-3 text-[11.5px]"
            >
              {v}
            </text>
          </g>
        ))}
        {rows.map((row, i) => {
          const t = TOP + i * RH;
          const informative =
            row.n < MIN_INFORMATIVE_N &&
            row.lanes.some((l) => l.state === "value");
          return (
            <g key={row.sc}>
              <line
                x1={0}
                x2={W}
                y1={t + RH}
                y2={t + RH}
                stroke="var(--line)"
              />
              <text
                x={0}
                y={t + 28}
                className="fill-ink-3 font-mono text-[12px]"
              >
                {row.sc}
              </text>
              <text
                x={56}
                y={t + 28}
                className="fill-ink text-[13.5px] font-medium"
              >
                {names[row.sc]}
              </text>
              <text x={56} y={t + 47} className="num fill-ink-3 text-[11.5px]">
                {`n = ${row.n.toLocaleString("en-GB")}`}
                {informative
                  ? " · interval not informative at this sample size"
                  : ""}
              </text>
              {row.lanes.map((lane, j) => {
                const y = t + 24 + j * 22;
                const strong = lane.condition === "hybrid";
                return (
                  <g key={lane.condition}>
                    {lane.state === "cannot-decide" ? (
                      <text
                        x={PX0 + 8}
                        y={y + 4}
                        className="fill-ink-2 text-[12.5px]"
                        style={KNOCKOUT}
                      >
                        {cannot(lane.condition)}
                      </text>
                    ) : null}
                    {lane.state === "no-failures" && j === 0 ? (
                      <text
                        x={PX0 + 8}
                        y={y + 4}
                        className="fill-ink-2 text-[12.5px]"
                        style={KNOCKOUT}
                      >
                        No failures on this stratum in the truth data
                      </text>
                    ) : null}
                    {lane.state === "value" && lane.value !== null ? (
                      <>
                        {lane.ciShown && lane.ci ? (
                          <Whisker
                            x1={x(lane.ci[0])}
                            x2={x(lane.ci[1])}
                            y={y}
                            strong={strong}
                          />
                        ) : null}
                        <Mark
                          condition={lane.condition}
                          x={x(lane.value)}
                          y={y}
                        />
                      </>
                    ) : null}
                    <text x={RX} y={y + 4} className="fill-ink-3 text-[12px]">
                      {SERIES_LABEL(lane.condition)}
                    </text>
                    <text
                      x={RX + 76}
                      y={y + 4}
                      className="num fill-ink text-[13.5px] font-semibold"
                    >
                      {lane.state === "value" && lane.value !== null
                        ? lane.value.toFixed(3)
                        : "n/a"}
                    </text>
                    {lane.state === "value" && lane.ciShown ? (
                      <text
                        x={RX + 124}
                        y={y + 4}
                        className="num fill-ink-3 text-[12px]"
                      >
                        {interval(lane.ci)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </>
  );
}

export function PrecisionChart({
  rows,
  stratum,
  names,
  labelA,
  labelB,
}: {
  rows: PrecisionRow[];
  stratum: string;
  names: Record<string, string>;
  labelA: string;
  labelB: string;
}) {
  const W = 1000;
  const PX0 = 372;
  const PW = 340;
  const TOP = 32;
  const RH = 56;
  const RX = 742;
  const { lo, hi, ticks } = axisRange(rows);
  const margin = rows[0]?.margin ?? -0.05;
  const x = (v: number) => PX0 + (PW * (v - lo)) / (hi - lo);
  const plotB = TOP + RH * rows.length;
  const H = plotB + 44;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={describePrecision(rows, stratum)}
      className="block h-auto w-full min-w-200 font-sans"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x={x(lo)}
        y={TOP - 4}
        width={x(margin) - x(lo)}
        height={plotB - TOP + 4}
        fill="var(--subtle)"
      />
      <text x={0} y={16} className="fill-ink-3 text-[11.5px] font-medium">
        Criterion and predictions (n)
      </text>
      <text x={RX} y={16} className="fill-ink-3 text-[11.5px] font-medium">
        Difference [95% interval] and verdict
      </text>
      {ticks.map((v) => (
        <text
          key={v}
          x={x(v)}
          y={16}
          textAnchor="middle"
          className="num fill-ink-3 text-[11.5px]"
        >
          {v === 0 ? "0" : signed(v, 2)}
        </text>
      ))}
      <line x1={x(0)} x2={x(0)} y1={TOP - 4} y2={plotB} stroke="var(--ink-3)" />
      <line
        x1={x(margin)}
        x2={x(margin)}
        y1={TOP - 4}
        y2={plotB}
        stroke="var(--ink-2)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      {rows.map((row, i) => {
        const t = TOP + i * RH;
        const y = t + 24;
        const verdict = precisionVerdict(row);
        return (
          <g key={row.sc}>
            <line x1={0} x2={W} y1={t + RH} y2={t + RH} stroke="var(--line)" />
            <text x={0} y={y} className="fill-ink-3 font-mono text-[12px]">
              {row.sc}
            </text>
            <text x={56} y={y} className="fill-ink text-[13.5px] font-medium">
              {names[row.sc]}
            </text>
            <text x={56} y={t + 43} className="num fill-ink-3 text-[11.5px]">
              {`n = ${row.predictionsA.toLocaleString("en-GB")} ${labelA} and ${row.predictionsB.toLocaleString("en-GB")} ${labelB} predictions`}
            </text>
            {row.status !== "not-estimable" &&
            row.low !== null &&
            row.high !== null ? (
              <>
                <Whisker
                  x1={x(row.low)}
                  x2={x(row.high)}
                  y={y}
                  strong
                  cap={5}
                />
                {row.point !== null ? (
                  <Mark condition="hybrid" x={x(row.point)} y={y} />
                ) : null}
                <text
                  x={RX}
                  y={y - 2}
                  className="num fill-ink text-[13.5px] font-semibold"
                >
                  {row.point === null ? "n/a" : signed(row.point)}
                </text>
                <text
                  x={RX + 52}
                  y={y - 2}
                  className="num fill-ink-3 text-[12px]"
                >
                  {signedInterval(row.low, row.high)}
                </text>
              </>
            ) : (
              <>
                <text
                  x={PX0 + 8}
                  y={y + 4}
                  className="fill-ink-2 text-[12.5px]"
                  style={KNOCKOUT}
                >
                  {row.predictionsB === 0
                    ? `Not estimable: ${labelB} makes no predictions`
                    : "Not estimable for this criterion"}
                </text>
                <text
                  x={RX}
                  y={y - 2}
                  className="num fill-ink text-[13.5px] font-semibold"
                >
                  n/a
                </text>
              </>
            )}
            <text
              x={RX}
              y={y + 16}
              className="fill-ink text-[12.5px] font-semibold"
            >
              {verdict.word}
            </text>
            {verdict.detail ? (
              <text x={RX + 76} y={y + 16} className="fill-ink-3 text-[11.5px]">
                {verdict.detail}
              </text>
            ) : null}
          </g>
        );
      })}
      <text
        x={x(margin) + 4}
        y={plotB + 18}
        textAnchor="end"
        className="num fill-ink-3 text-[11.5px]"
      >
        {`Margin ${signed(margin, 2)} (dashed)`}
      </text>
      <text
        x={x(0) - 4}
        y={plotB + 18}
        textAnchor="start"
        className="fill-ink-3 text-[11.5px]"
      >
        No difference
      </text>
      <text
        x={(x(lo) + x(margin)) / 2}
        y={plotB + 32}
        textAnchor="middle"
        className="fill-ink-3 text-[11.5px]"
      >
        Beyond the margin
      </text>
    </svg>
  );
}
