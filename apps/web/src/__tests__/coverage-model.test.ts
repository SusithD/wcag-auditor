import { describe, expect, it } from "vitest";
import {
  findingsFor,
  meterFor,
  plural,
  stateFor,
} from "@/components/views/coverage-model";
import { subjectParts } from "@/components/views/run-header";
import { runViewHref } from "@/components/views/run-nav";
import type { Finding } from "@/lib/report";

const finding = (over: Partial<Finding>): Finding =>
  ({
    key: "k",
    sc: "1.4.3",
    provenance: "rule",
    tier: "automated",
    severity: "serious",
    ...over,
  }) as Finding;

describe("stateFor", () => {
  it("reports Failed when a non-review finding exists", () => {
    expect(stateFor("automated", [finding({})])).toBe("failed");
  });

  it("reports No issue found only for an automated verdict with no findings", () => {
    expect(stateFor("automated", [])).toBe("pass");
  });

  it("separates could not decide from no verdict", () => {
    expect(stateFor("not-assessable", [])).toBe("undecided");
    expect(stateFor("none", [])).toBe("no-verdict");
  });

  it("reports Needs review for a needs-review verdict", () => {
    expect(stateFor("needs-review", [])).toBe("review");
  });
});

describe("channel counts", () => {
  const all = [
    finding({ key: "a", provenance: "rule" }),
    finding({ key: "b", provenance: "pixel" }),
    finding({ key: "c", provenance: "both" }),
    finding({ key: "d", sc: "2.5.8", provenance: "both" }),
  ];

  it("counts both-channel findings in each channel and everything in hybrid", () => {
    expect(findingsFor(all, "1.4.3", "rule")).toHaveLength(2);
    expect(findingsFor(all, "1.4.3", "pixel")).toHaveLength(2);
    expect(findingsFor(all, "1.4.3", "hybrid")).toHaveLength(3);
  });

  it("pluralises", () => {
    expect(plural(1, "finding", "findings")).toBe("1 finding");
    expect(plural(0, "finding", "findings")).toBe("0 findings");
  });
});

describe("meterFor", () => {
  it("counts decided, review and undecided criteria", () => {
    expect(
      meterFor(["automated", "automated", "needs-review", "none"]),
    ).toEqual({ decided: 2, review: 1, undecided: 1 });
  });
});

describe("run navigation", () => {
  it("links each view and keeps the viewport", () => {
    expect(runViewHref("r1", "report", "?vp=mobile")).toBe(
      "/runs/r1?vp=mobile",
    );
    expect(runViewHref("r1", "table", "?vp=mobile")).toBe(
      "/runs/r1?vp=mobile&view=table",
    );
    expect(runViewHref("r1", "coverage", "?vp=desktop")).toBe(
      "/runs/r1/coverage?vp=desktop",
    );
    expect(runViewHref("r1", "compare")).toBe("/runs/r1/compare");
  });

  it("splits a web address into host and path", () => {
    expect(subjectParts("url", "https://example.org/about/story?x=1")).toEqual({
      host: "example.org",
      path: "/about/story?x=1",
    });
    expect(subjectParts("folder", "/data/captures/site_001")).toEqual({
      host: "site_001",
      path: "",
    });
  });
});
