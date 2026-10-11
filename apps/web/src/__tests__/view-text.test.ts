import { describe, expect, it } from "vitest";
import { diffRowLabel } from "@/lib/compare";
import {
  emphasisSegments,
  plainWording,
  stripEmphasis,
} from "@/lib/coverage-text";

describe("coverage wording", () => {
  const claim =
    "Coverage claim (RQ3): the rule-only configuration returns a verdict on **2 of 8** criteria; 1.4.3 needs-review; 2.5.7 not-assessable).";

  it("drops jargon and uses one spelling of needs review", () => {
    const text = plainWording(claim);
    expect(text).toMatch(/^Coverage summary: Rules only/);
    expect(text).not.toContain("RQ3");
    expect(text).not.toContain("needs-review");
    expect(text).toContain("needs review");
  });

  it("rewrites the detectability jargon", () => {
    expect(plainWording("both (rule: axe color-contrast; pixel: module)")).toBe(
      "both (rule channel: axe contrast check; pixel channel: our own measurement)",
    );
    expect(plainWording("pixel (+DOM)")).not.toContain("+DOM");
  });

  it("splits bold markers into strong segments", () => {
    const segs = emphasisSegments("a **2 of 8** b");
    expect(segs.map((s) => [s.text, s.strong])).toEqual([
      ["a ", false],
      ["2 of 8", true],
      [" b", false],
    ]);
    expect(new Set(segs.map((s) => s.at)).size).toBe(3);
    expect(stripEmphasis("a **2 of 8** b")).toBe("a 2 of 8 b");
  });
});

describe("diff row naming", () => {
  it("adds a position and an element hint", () => {
    const row = {
      side: "hybrid" as const,
      finding: { sc: "1.4.11", key: "k", element: "button.save  >  svg" },
    };
    expect(diffRowLabel(row, 1, 3)).toBe("Item 2 of 3, button.save > svg");
  });
});
