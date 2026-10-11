"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  Legend,
  XAxis,
  YAxis,
} from "recharts";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { chartPoints, describeChart, type EvalCell } from "@/lib/eval";

const CONFIG = {
  precision: { label: "Precision", color: "var(--chart-1)" },
  recall: { label: "Recall", color: "var(--chart-2)" },
  f1: { label: "F1", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function EvalChart({
  cells,
  condition,
  stratum,
}: {
  cells: EvalCell[];
  condition: string;
  stratum: string;
}) {
  const points = chartPoints(cells);
  return (
    <figure>
      <div role="img" aria-label={describeChart(cells, condition, stratum)}>
        <ChartContainer
          config={CONFIG}
          className="h-80 w-full"
          aria-hidden="true"
        >
          <BarChart
            data={points}
            accessibilityLayer={false}
            margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              <pattern
                id="pat-recall"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="var(--card)" />
                <rect width="3" height="6" fill="var(--color-recall)" />
              </pattern>
              <pattern
                id="pat-f1"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
              >
                <rect width="6" height="6" fill="var(--card)" />
                <circle cx="3" cy="3" r="2" fill="var(--color-f1)" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="sc" tickLine={false} />
            <YAxis domain={[0, 1]} tickCount={6} width={36} />
            <Legend />
            {(["precision", "recall", "f1"] as const).map((key) => (
              <Bar
                key={key}
                dataKey={key}
                name={CONFIG[key].label}
                fill={
                  key === "precision"
                    ? "var(--color-precision)"
                    : `url(#pat-${key})`
                }
                stroke={`var(--color-${key})`}
                strokeWidth={1}
                isAnimationActive={false}
              >
                <ErrorBar
                  dataKey={`${key}Err`}
                  width={4}
                  stroke="var(--foreground)"
                />
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      </div>
      <figcaption className="mt-1 text-caption text-muted-foreground">
        Bars show precision, recall and F1 per criterion; whiskers are the 95%
        bootstrap interval over pages.
      </figcaption>
    </figure>
  );
}
