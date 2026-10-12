import { describe, expect, it } from "vitest";
import {
  formatRatio,
  meterLabel,
  meterSegments,
  severityWords,
  splitSc,
} from "@/components/ds/helpers";
import { SHAPE_KINDS } from "@/components/ds/status-shape";

describe("meterSegments", () => {
  it("orders decided, review, undecided, then empty", () => {
    expect(meterSegments(3, 2, 1, 8)).toEqual([
      "decided",
      "decided",
      "decided",
      "review",
      "review",
      "undecided",
      "empty",
      "empty",
    ]);
  });

  it("never exceeds the total and ignores negatives", () => {
    expect(meterSegments(9, 3, 0, 8)).toEqual(Array(8).fill("decided"));
    expect(meterSegments(-2, 0, 0, 3)).toEqual(["empty", "empty", "empty"]);
  });
});

describe("meterLabel", () => {
  it("states each non-zero group in words", () => {
    expect(meterLabel(6, 1, 1)).toBe(
      "6 of 8 criteria decided, 1 need review, 1 could not be decided",
    );
    expect(meterLabel(8, 0, 0)).toBe("8 of 8 criteria decided");
  });
});

describe("small helpers", () => {
  it("splits success criterion codes", () => {
    expect(splitSc("1.4.3")).toEqual(["1", "4", "3"]);
  });

  it("spells severity counts for screen readers", () => {
    expect(severityWords({ critical: 1, serious: 0, minor: 4 })).toBe(
      "1 critical, 0 serious, 4 minor",
    );
  });

  it("formats ratios to two decimals", () => {
    expect(formatRatio(4.5)).toBe("4.50");
    expect(formatRatio("3.1", 1)).toBe("3.1");
    expect(formatRatio("n/a")).toBe("n/a");
  });

  it("draws all ten status shapes", () => {
    expect(SHAPE_KINDS).toHaveLength(10);
  });
});
