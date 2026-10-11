import { describe, expect, it } from "vitest";
import {
  axisRange,
  interval,
  joinList,
  limitItems,
  pairVerdict,
  precisionLead,
  precisionRows,
  precisionVerdict,
  recallRows,
  seriesFor,
  signed,
} from "@/components/eval/eval-model";
import type { EvalCell, EvalView } from "@/lib/eval";

function cell(
  condition: string,
  sc: string,
  over: Partial<EvalCell> = {},
): EvalCell {
  return {
    condition,
    stratum: "real",
    sc,
    tp: 10,
    fp: 10,
    fn: 40,
    duplicates: 0,
    precision: 0.5,
    recall: 0.2,
    f1: 0.3,
    precision_ci: [0.4, 0.6],
    recall_ci: [0.1, 0.3],
    f1_ci: null,
    ...over,
  };
}

const view: EvalView = {
  meta: {
    items_scored: 100,
    items_unlabelled: 3,
    seed: 1,
    resamples: 10000,
    conditions: ["rule_only", "hybrid"],
    include_needs_review: true,
    benchmark_sha: null,
    truth_sha: null,
    protocol_sha: null,
    rule_only_scs: ["1.4.3"],
  },
  cells: [
    cell("hybrid", "1.4.3"),
    cell("rule_only", "1.4.3", { recall: 0.1 }),
    cell("hybrid", "1.4.11", { tp: 2, fn: 3 }),
    cell("rule_only", "1.4.11", { tp: 0, fn: 5, recall: null }),
    cell("hybrid", "2.5.7", { tp: 0, fn: 0, recall: null }),
    cell("rule_only", "2.5.7", { tp: 0, fn: 0, recall: null }),
  ],
  mcnemar_a: "hybrid",
  mcnemar_b: "rule_only",
  mcnemar: [],
  delta_precision: [
    {
      stratum: "real",
      sc: "1.4.3",
      low: -0.07,
      high: 0.04,
      margin: -0.05,
      non_inferior: false,
    },
    {
      stratum: "real",
      sc: "2.5.8",
      low: null,
      high: null,
      margin: -0.05,
      non_inferior: null,
    },
  ],
};

describe("formatting", () => {
  it("uses a true minus sign and explicit plus", () => {
    expect(signed(-0.014)).toBe("−0.014");
    expect(signed(0.042)).toBe("+0.042");
    expect(signed(0)).toBe("0.000");
    expect(interval([0.5, 0.75])).toBe("[0.50, 0.75]");
    expect(interval(null)).toBe("");
  });

  it("joins lists in words", () => {
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });

  it("orders series hybrid first and drops unknown conditions", () => {
    expect(seriesFor(["pixel", "rule_only", "hybrid", "x"])).toEqual([
      "hybrid",
      "rule_only",
      "pixel",
    ]);
  });
});

describe("recallRows", () => {
  const rows = recallRows(view, "real", ["hybrid", "rule_only"]);
  const by = (sc: string) => rows.find((r) => r.sc === sc);

  it("marks rule-only as unable to decide outside its criteria", () => {
    expect(by("1.4.11")?.lanes.map((l) => l.state)).toEqual([
      "value",
      "cannot-decide",
    ]);
  });

  it("flags criteria with no failures in the truth data", () => {
    expect(by("2.5.7")?.n).toBe(0);
    expect(by("2.5.7")?.lanes.every((l) => l.state === "no-failures")).toBe(
      true,
    );
  });

  it("hides intervals below the informative sample size", () => {
    expect(by("1.4.3")?.lanes[0].ciShown).toBe(true);
    expect(by("1.4.11")?.lanes[0].ciShown).toBe(false);
  });

  it("reports criteria missing from the data as unavailable", () => {
    expect(by("2.4.7")?.lanes.every((l) => l.state === "unavailable")).toBe(
      true,
    );
  });
});

describe("pairVerdict", () => {
  it("names the better condition only when the adjusted p is below 0.05", () => {
    expect(pairVerdict(84, 40, 0.0004, "Hybrid", "Rule-only").kind).toBe("a");
    expect(pairVerdict(2, 30, 0.0004, "Hybrid", "Rule-only").kind).toBe("b");
    expect(pairVerdict(1, 7, 0.07, "Hybrid", "Rule-only").words).toBe(
      "Too close to call",
    );
  });

  it("says so when nothing differs or there is no test", () => {
    expect(pairVerdict(0, 0, null, "Hybrid", "Rule-only").words).toBe(
      "No differing outcomes, so no test",
    );
    expect(pairVerdict(3, 1, null, "Hybrid", "Rule-only").kind).toBe("none");
  });
});

describe("precision", () => {
  const rows = precisionRows(view, "real", "hybrid", "rule_only");

  it("computes the point difference and verdict words", () => {
    const row = rows.find((r) => r.sc === "1.4.3");
    expect(row?.point).toBeCloseTo(0, 5);
    expect(row?.status).toBe("not-shown");
    expect(row && precisionVerdict(row)).toEqual({
      word: "Not shown",
      detail: "lower bound −0.070 is below −0.05",
    });
  });

  it("treats rows without an interval as not estimable", () => {
    const row = rows.find((r) => r.sc === "2.5.8");
    expect(row?.status).toBe("not-estimable");
    expect(row?.point).toBeNull();
  });

  it("writes the lead from the data", () => {
    expect(precisionLead(rows)).toContain("only on 1.4.3");
    expect(precisionLead(rows)).toContain("non-inferiority is not shown");
  });

  it("covers the margin and every interval on the axis", () => {
    const { lo, hi, ticks } = axisRange(rows);
    expect(lo).toBeLessThanOrEqual(-0.07);
    expect(hi).toBeGreaterThanOrEqual(0.04);
    expect(ticks).toContain(0);
    expect(ticks).toContain(-0.05);
  });
});

describe("limitItems", () => {
  it("derives limits from the data and keeps the scope line", () => {
    const items = limitItems(view, "real", ["hybrid", "rule_only"]);
    const text = items.map((i) => `${i.lead} ${i.text}`).join("\n");
    expect(text).toContain("none for 2.5.7");
    expect(text).toContain("Rule-only can decide 1 of 8");
    expect(text).toContain("100 captures were scored and 3");
    expect(text).toContain("8 of the 86 WCAG 2.2 success criteria");
  });
});
