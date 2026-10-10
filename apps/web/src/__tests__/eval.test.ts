import { describe, expect, it } from "vitest";
import { counterpart, SyncBus } from "@/lib/compare";
import {
  cellsFor,
  chartPoints,
  describeChart,
  type EvalCell,
  type EvalView,
  fmt,
  fmtCi,
  fmtP,
  progressFraction,
} from "@/lib/eval";

function cell(over: Partial<EvalCell>): EvalCell {
  return {
    condition: "hybrid",
    stratum: "real",
    sc: "1.4.3",
    tp: 5,
    fp: 1,
    fn: 4,
    duplicates: 0,
    precision: 0.8,
    recall: 0.5,
    f1: 0.6,
    precision_ci: [0.6, 0.9],
    recall_ci: [0.3, 0.7],
    f1_ci: null,
    ...over,
  };
}

describe("eval helpers", () => {
  it("selects and orders the cells of one condition and stratum", () => {
    const view = {
      cells: [
        cell({ sc: "2.5.8" }),
        cell({ sc: "1.4.3" }),
        cell({ sc: "1.4.11" }),
        cell({ condition: "rule_only" }),
        cell({ stratum: "synthetic" }),
      ],
    } as unknown as EvalView;
    expect(cellsFor(view, "hybrid", "real").map((c) => c.sc)).toEqual([
      "1.4.3",
      "1.4.11",
      "2.5.8",
    ]);
  });

  it("turns confidence intervals into whisker offsets and tolerates undefined metrics", () => {
    const [p] = chartPoints([cell({})]);
    expect(p.precisionErr?.[0]).toBeCloseTo(0.2);
    expect(p.precisionErr?.[1]).toBeCloseTo(0.1);
    expect(p.f1Err).toBeNull();
    const [none] = chartPoints([
      cell({ precision: null, precision_ci: [0, 1] }),
    ]);
    expect(none.precisionErr).toBeNull();
  });

  it("formats numbers, intervals and p-values", () => {
    expect([fmt(0.71234), fmt(null), fmt(1, 1)]).toEqual([
      "0.712",
      "n/a",
      "1.0",
    ]);
    expect([fmtCi([0.571, 0.849]), fmtCi(null)]).toEqual(["[0.57, 0.85]", ""]);
    expect([fmtP(0.0000001), fmtP(0.0421), fmtP(null)]).toEqual([
      "<0.001",
      "0.042",
      "n/a",
    ]);
    expect([
      progressFraction(5, 10),
      progressFraction(0, 10),
      progressFraction(null, null),
      progressFraction(20, 10),
    ]).toEqual([50, 0, 0, 100]);
  });

  it("describes the chart in words for screen readers, including undefined values", () => {
    const text = describeChart(
      [cell({}), cell({ sc: "2.4.7", precision: null })],
      "hybrid",
      "real",
    );
    expect(text).toContain("Hybrid condition on the real stratum");
    expect(text).toContain("Highest F1 is 1.4.3 Contrast (Minimum) at 0.60");
    expect(text).toContain("View as table");
    expect(describeChart([cell({ f1: null })], "hybrid", "real")).not.toContain(
      "Highest F1",
    );
  });
});

describe("compare helpers", () => {
  const pairs = [
    { hybrid: "f001", rule_only: "f001" },
    { hybrid: "f003", rule_only: "f002" },
  ];
  it("maps a selection to its counterpart in the other view", () => {
    expect(counterpart(pairs, "hybrid", "f003")).toBe("f002");
    expect(counterpart(pairs, "rule_only", "f002")).toBe("f003");
    expect(counterpart(pairs, "hybrid", "f009")).toBeNull();
    expect(counterpart(pairs, "hybrid", null)).toBeNull();
  });

  it("publishes a view to every subscriber except its source and stops after unsubscribe", () => {
    const bus = new SyncBus();
    const seen: string[] = [];
    const offA = bus.subscribe("a", (v) => seen.push(`a:${v.scale}`));
    bus.subscribe("b", (v) => seen.push(`b:${v.scale}`));
    bus.publish("a", { x: 0, y: 0, scale: 2 });
    offA();
    bus.publish("b", { x: 0, y: 0, scale: 3 });
    expect(seen).toEqual(["b:2"]);
  });
});
