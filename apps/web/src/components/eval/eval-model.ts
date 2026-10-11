import type { EvalCell, EvalView } from "@/lib/eval";
import { CONDITION_LABEL, STRATUM_LABEL, type Stratum } from "@/lib/eval";
import { SC_LIST, SC_TITLES } from "@/lib/report";

export const MINUS = "−";
export const MIN_INFORMATIVE_N = 30;
export const ALPHA = 0.05;
export const SERIES_ORDER = ["hybrid", "rule_only", "pixel"] as const;

export type LaneState =
  | "value"
  | "cannot-decide"
  | "no-failures"
  | "unavailable";

export type Lane = {
  condition: string;
  state: LaneState;
  value: number | null;
  ci: [number, number] | null;
  ciShown: boolean;
};

export type RecallRow = {
  sc: string;
  n: number;
  lanes: Lane[];
};

export function seriesFor(conditions: string[]): string[] {
  return SERIES_ORDER.filter((c) => conditions.includes(c));
}

export function signed(value: number, places = 3): string {
  const text = Math.abs(value).toFixed(places);
  if (value < 0) return `${MINUS}${text}`;
  return value > 0 ? `+${text}` : text;
}

export function interval(ci: number[] | null, places = 2): string {
  return ci ? `[${ci[0].toFixed(places)}, ${ci[1].toFixed(places)}]` : "";
}

export function signedInterval(low: number, high: number): string {
  return `[${signed(low)}, ${signed(high)}]`;
}

function cell(
  view: EvalView,
  condition: string,
  stratum: string,
  sc: string,
): EvalCell | undefined {
  return view.cells.find(
    (c) => c.condition === condition && c.stratum === stratum && c.sc === sc,
  );
}

export function truthCount(c: EvalCell | undefined): number {
  return c ? c.tp + c.fn : 0;
}

export function recallRows(
  view: EvalView,
  stratum: string,
  series: string[],
): RecallRow[] {
  const decidable = new Set(view.meta.rule_only_scs);
  return SC_LIST.map((sc) => {
    const cells = series.map((cond) => cell(view, cond, stratum, sc));
    const n = Math.max(0, ...cells.map(truthCount));
    const lanes = series.map((condition, i): Lane => {
      const c = cells[i];
      const base = { condition, value: null, ci: null, ciShown: false };
      if (!c) return { ...base, state: "unavailable" };
      if (n === 0) return { ...base, state: "no-failures" };
      if (condition === "rule_only" && !decidable.has(sc))
        return { ...base, state: "cannot-decide" };
      if (c.recall === null) return { ...base, state: "unavailable" };
      const ci: [number, number] | null = c.recall_ci
        ? [c.recall_ci[0], c.recall_ci[1]]
        : null;
      return {
        condition,
        state: "value",
        value: c.recall,
        ci,
        ciShown: ci !== null && n >= MIN_INFORMATIVE_N,
      };
    });
    return { sc, n, lanes };
  });
}

export type PairVerdict = {
  kind: "a" | "b" | "close" | "none";
  words: string;
};

export function pairVerdict(
  onlyA: number,
  onlyB: number,
  pAdjusted: number | null,
  labelA: string,
  labelB: string,
): PairVerdict {
  if (onlyA + onlyB === 0)
    return { kind: "none", words: "No differing outcomes, so no test" };
  if (pAdjusted === null)
    return { kind: "none", words: "No test for this criterion" };
  if (pAdjusted < ALPHA) {
    return onlyA > onlyB
      ? { kind: "a", words: `${labelA} is better, unlikely to be chance` }
      : onlyA < onlyB
        ? { kind: "b", words: `${labelB} is better, unlikely to be chance` }
        : { kind: "close", words: "Too close to call" };
  }
  return { kind: "close", words: "Too close to call" };
}

export type PrecisionRow = {
  sc: string;
  predictionsA: number;
  predictionsB: number;
  precisionA: number | null;
  precisionB: number | null;
  ciA: number[] | null;
  ciB: number[] | null;
  point: number | null;
  low: number | null;
  high: number | null;
  margin: number;
  status: "shown" | "not-shown" | "not-estimable";
};

export function precisionRows(
  view: EvalView,
  stratum: string,
  a: string,
  b: string,
): PrecisionRow[] {
  const fallback = view.delta_precision[0]?.margin ?? -0.05;
  return SC_LIST.map((sc) => {
    const ca = cell(view, a, stratum, sc);
    const cb = cell(view, b, stratum, sc);
    const d = view.delta_precision.find(
      (r) => r.stratum === stratum && r.sc === sc,
    );
    const estimable = !!d && d.low !== null && d.high !== null;
    const point =
      estimable &&
      ca?.precision !== null &&
      ca?.precision !== undefined &&
      cb?.precision !== null &&
      cb?.precision !== undefined
        ? ca.precision - cb.precision
        : null;
    return {
      sc,
      predictionsA: ca ? ca.tp + ca.fp : 0,
      predictionsB: cb ? cb.tp + cb.fp : 0,
      precisionA: ca?.precision ?? null,
      precisionB: cb?.precision ?? null,
      ciA: ca?.precision_ci ?? null,
      ciB: cb?.precision_ci ?? null,
      point,
      low: d?.low ?? null,
      high: d?.high ?? null,
      margin: d?.margin ?? fallback,
      status:
        !estimable || d?.non_inferior === null || d === undefined
          ? "not-estimable"
          : d.non_inferior
            ? "shown"
            : "not-shown",
    };
  });
}

export function precisionVerdict(row: PrecisionRow): {
  word: string;
  detail: string;
} {
  if (row.status === "not-estimable")
    return { word: "Not estimable", detail: "" };
  const low = row.low as number;
  return row.status === "shown"
    ? {
        word: "Shown",
        detail: `lower bound ${signed(low)} is above ${signed(row.margin, 2)}`,
      }
    : {
        word: "Not shown",
        detail: `lower bound ${signed(low)} is below ${signed(row.margin, 2)}`,
      };
}

export function axisRange(rows: PrecisionRow[]): {
  lo: number;
  hi: number;
  ticks: number[];
} {
  const margin = rows[0]?.margin ?? -0.05;
  const lows = rows.flatMap((r) => (r.low === null ? [] : [r.low]));
  const highs = rows.flatMap((r) => (r.high === null ? [] : [r.high]));
  const span = (Math.max(0, ...highs) - Math.min(margin, ...lows)) / 0.05;
  const step = span > 8 ? 0.1 : 0.05;
  const lo = Math.floor((Math.min(margin, ...lows) - 0.02) / step) * step;
  const hi = Math.ceil((Math.max(0, ...highs) + 0.02) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step)
    ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function recallLead(view: EvalView, series: string[]): string {
  if (!series.includes("rule_only"))
    return "Recall is the share of true failures in the truth data that the audit found. Intervals are 95% bootstrap intervals over pages.";
  const decidable = SC_LIST.filter((sc) =>
    view.meta.rule_only_scs.includes(sc),
  );
  const rest = SC_LIST.length - decidable.length;
  const first = `Rule-only can decide ${decidable.length} of ${SC_LIST.length} criteria${decidable.length ? ` (${joinList(decidable)})` : ""}.`;
  const second =
    rest > 0
      ? ` On the other ${rest} it reports nothing, so only the other conditions have a recall value there.`
      : "";
  return `${first}${second} Where both decide, the paired table shows which is right more often.`;
}

export function precisionLead(rows: PrecisionRow[]): string {
  const estimable = rows.filter((r) => r.status !== "not-estimable");
  if (estimable.length === 0)
    return "No criterion has an estimable precision difference on this page set.";
  const notShown = estimable.filter((r) => r.status === "not-shown");
  const shown = estimable.filter((r) => r.status === "shown");
  const margin = signed(estimable[0].margin, 2);
  const list = joinList(estimable.map((r) => r.sc));
  const parts = [
    `Precision can be compared only on ${list}, where both conditions make predictions.`,
  ];
  if (notShown.length)
    parts.push(
      `On ${joinList(notShown.map((r) => r.sc))} the lower bound of the interval falls below the ${margin} margin, so non-inferiority is not shown.`,
    );
  if (shown.length)
    parts.push(
      `On ${joinList(shown.map((r) => r.sc))} the lower bound stays above the margin, so non-inferiority is shown.`,
    );
  return parts.join(" ");
}

export function describeRecall(
  rows: RecallRow[],
  series: string[],
  stratum: string,
): string {
  const names = series.map((c) => CONDITION_LABEL[c] ?? c).join(", ");
  const best = rows
    .flatMap((r) =>
      r.lanes
        .filter((l) => l.state === "value" && l.value !== null)
        .map((l) => ({ sc: r.sc, v: l.value as number, c: l.condition })),
    )
    .sort((x, y) => y.v - x.v)[0];
  const lead = best
    ? ` Highest recall is ${best.sc} ${SC_TITLES[best.sc] ?? ""} at ${best.v.toFixed(3)} for ${CONDITION_LABEL[best.c] ?? best.c}.`
    : "";
  return `Recall by criterion on the ${STRATUM_LABEL[stratum as Stratum]?.toLowerCase() ?? stratum} stratum for ${names}, with 95% intervals.${lead} Switch to Table for every value.`;
}

export function describePrecision(
  rows: PrecisionRow[],
  stratum: string,
): string {
  const est = rows.filter((r) => r.status !== "not-estimable");
  const margin = signed(rows[0]?.margin ?? -0.05, 2);
  return `Difference in precision on the ${stratum} stratum with 95% intervals against a margin of ${margin}. ${est.length} of ${rows.length} criteria are estimable. Switch to Table for every value.`;
}

export type LimitItem = {
  shape: "review" | "undecided" | "alert" | "done" | "pass";
  lead: string;
  text: string;
};

export function limitItems(
  view: EvalView,
  stratum: string,
  series: string[],
): LimitItem[] {
  const primary = series[0];
  const items: LimitItem[] = [];
  const small = SC_LIST.map((sc) => ({
    sc,
    n: truthCount(cell(view, primary, stratum, sc)),
  })).filter((r) => r.n < MIN_INFORMATIVE_N);
  if (small.length)
    items.push({
      shape: "undecided",
      lead: "Small samples.",
      text: `The ${stratum} stratum holds ${joinList(
        small.map((r) =>
          r.n === 0 ? `none for ${r.sc}` : `${r.n} for ${r.sc}`,
        ),
      )} true failures. Intervals from fewer than ${MIN_INFORMATIVE_N} pages are wide; read them with care.`,
    });
  const lowest = SC_LIST.flatMap((sc) => {
    const c = cell(view, primary, stratum, sc);
    return c && c.precision !== null ? [{ sc, p: c.precision }] : [];
  })
    .sort((x, y) => x.p - y.p)
    .slice(0, 3);
  if (lowest.length)
    items.push({
      shape: "alert",
      lead: "False alarms.",
      text: `${CONDITION_LABEL[primary] ?? primary} precision on the ${stratum} stratum is lowest for ${joinList(
        lowest.map((r) => `${r.sc} (${r.p.toFixed(3)})`),
      )}.`,
    });
  if (series.includes("rule_only"))
    items.push({
      shape: "review",
      lead: "Rule-only coverage.",
      text: `Rule-only can decide ${view.meta.rule_only_scs.length} of ${SC_LIST.length} criteria, so paired comparisons exist only where both conditions decide.`,
    });
  items.push({
    shape: "done",
    lead: "Scoring.",
    text: `${view.meta.items_scored} captures were scored and ${view.meta.items_unlabelled} had no ground truth and were left out. ${
      view.meta.include_needs_review
        ? "Needs-review findings are counted as findings."
        : "Only automated findings are counted."
    }`,
  });
  items.push({
    shape: "undecided",
    lead: "Coverage.",
    text: "The tool checks 8 of the 86 WCAG 2.2 success criteria. A result is not a conformance claim.",
  });
  return items;
}
