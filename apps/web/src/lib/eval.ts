import type { components } from "@/api/types";
import { SC_LIST, SC_TITLES } from "@/lib/report";

export type EvalView = components["schemas"]["EvalView"];
export type EvalCell = components["schemas"]["EvalCell"];
export type EvalSummary = components["schemas"]["EvalSummary"];
export type McNemarRow = components["schemas"]["McNemarRow"];
export type DeltaRow = components["schemas"]["DeltaRow"];

export const STRATA = ["real", "synthetic", "combined"] as const;
export type Stratum = (typeof STRATA)[number];
export const STRATUM_LABEL: Record<Stratum, string> = {
  real: "Real",
  synthetic: "Synthetic",
  combined: "Combined",
};
export const CONDITION_LABEL: Record<string, string> = {
  rule_only: "Rule-only",
  pixel: "Pixel",
  hybrid: "Hybrid",
};

export function cellsFor(
  view: EvalView,
  condition: string,
  stratum: string,
): EvalCell[] {
  return view.cells
    .filter((c) => c.condition === condition && c.stratum === stratum)
    .sort((a, b) => SC_LIST.indexOf(a.sc) - SC_LIST.indexOf(b.sc));
}

export type Point = {
  sc: string;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  precisionErr: [number, number] | null;
  recallErr: [number, number] | null;
  f1Err: [number, number] | null;
};

function err(
  value: number | null,
  ci: number[] | null,
): [number, number] | null {
  if (value === null || !ci) return null;
  return [Math.max(0, value - ci[0]), Math.max(0, ci[1] - value)];
}

export function chartPoints(cells: EvalCell[]): Point[] {
  return cells.map((c) => ({
    sc: c.sc,
    precision: c.precision,
    recall: c.recall,
    f1: c.f1,
    precisionErr: err(c.precision, c.precision_ci),
    recallErr: err(c.recall, c.recall_ci),
    f1Err: err(c.f1, c.f1_ci),
  }));
}

export function fmt(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? "n/a" : value.toFixed(digits);
}

export function fmtCi(ci: number[] | null): string {
  return ci ? `[${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]` : "";
}

export function fmtP(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  return value < 0.001 ? "<0.001" : value.toFixed(3);
}

export function describeChart(
  cells: EvalCell[],
  condition: string,
  stratum: string,
): string {
  const parts = cells.map(
    (c) =>
      `${c.sc} ${SC_TITLES[c.sc] ?? ""}: precision ${fmt(c.precision, 2)}, recall ${fmt(c.recall, 2)}, F1 ${fmt(c.f1, 2)}`,
  );
  return `Bar chart of precision, recall and F1 with 95% confidence whiskers for the ${CONDITION_LABEL[condition] ?? condition} condition on the ${stratum} stratum. ${parts.join("; ")}.`;
}

export function progressFraction(
  done: number | null,
  total: number | null,
): number {
  if (!done || !total) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}
