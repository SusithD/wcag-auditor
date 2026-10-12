import { describe, expect, it } from "vitest";
import type { RunSummary } from "@/api/client";
import {
  bucketCriteria,
  contrastRatio,
  deltaCounts,
  deltaText,
  fixDiff,
  focusStepsFor,
  foundBy,
  groupFindings,
  hasPlaceholder,
  isEstimated,
  parseRatio,
  provenanceWords,
  ratioPair,
  relativeTime,
  ruler,
  rulerLabel,
  rulerPosition,
  runAgainBody,
  sentence,
  sourceParts,
  tally,
  verdictSentence,
  verdictText,
  withoutPlaceholders,
} from "@/components/report/logic";
import type { CoverageCell, Finding } from "@/lib/report";

function finding(over: Partial<Finding>): Finding {
  return {
    id: 1,
    key: "f001",
    viewport: "desktop",
    sc: "1.4.3",
    bbox: { x: 10, y: 20, w: 100, h: 30 },
    focus_index: null,
    severity: "serious",
    tier: "automated",
    score: 0.9,
    provenance: "rule",
    element: "p.story",
    guidance: null,
    evidence_rows: [],
    has_crop: false,
    status: "open",
    ...over,
  } as Finding;
}

function cell(sc: string, hybrid: CoverageCell["hybrid_verdict"]) {
  return {
    sc,
    rule_verdict: hybrid,
    pixel_verdict: hybrid,
    hybrid_verdict: hybrid,
  } as CoverageCell;
}

const COVERAGE: CoverageCell[] = [
  cell("1.4.3", "automated"),
  cell("1.4.11", "needs-review"),
  cell("2.4.7", "automated"),
  cell("2.4.11", "automated"),
  cell("2.4.12", "not-assessable"),
  cell("2.4.13", "automated"),
  cell("2.5.7", "none"),
  cell("2.5.8", "automated"),
];

describe("tally and verdict sentence", () => {
  const findings = [
    finding({ id: 1, key: "f1", severity: "serious" }),
    finding({ id: 2, key: "f2", severity: "minor", sc: "2.5.8" }),
    finding({ id: 3, key: "f3", severity: "minor", sc: "2.4.13" }),
    finding({
      id: 4,
      key: "f4",
      tier: "needs-review",
      sc: "1.4.11",
      provenance: "pixel",
    }),
    finding({ id: 5, key: "f5", status: "dismissed" }),
  ];

  it("counts failures by severity, review items and criteria separately", () => {
    const t = tally(findings, COVERAGE);
    expect(t).toMatchObject({
      failures: 3,
      serious: 1,
      minor: 2,
      critical: 0,
      review: 1,
      dismissed: 1,
      decided: 5,
      reviewCriteria: 1,
      undecided: 2,
    });
  });

  it("writes the verdict with failures, needs-review and undecided apart", () => {
    expect(verdictText(tally(findings, COVERAGE))).toBe(
      "3 failures in the 5 criteria the tool could decide. 1 finding needs review, and 2 criteria could not be decided on this page.",
    );
  });

  it("uses singular forms and marks the counts as strong", () => {
    const t = tally([finding({})], [cell("1.4.3", "automated")]);
    const parts = verdictSentence(t);
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual([
      "1 failure",
      "No findings",
      "7 criteria",
    ]);
    expect(verdictText(t)).toContain(
      "in the 1 criterion the tool could decide",
    );
  });

  it("does not claim a clean page when nothing could be decided", () => {
    const t = tally([], []);
    expect(verdictText(t)).toBe(
      "No criterion could be decided automatically on this page. No findings need review, and 8 criteria could not be decided on this page.",
    );
  });

  it("says no failures when criteria were decided and nothing failed", () => {
    const t = tally([], COVERAGE);
    expect(
      verdictText(t).startsWith("No failures found in the 5 criteria"),
    ).toBe(true);
  });

  it("counts zero undecided criteria when every criterion has a verdict", () => {
    const all = COVERAGE.map((c) => cell(c.sc, "automated"));
    expect(verdictText(tally([], all))).toMatch(
      /0 criteria could not be decided on this page\.$/,
    );
  });
});

describe("rail buckets", () => {
  it("puts criteria with failures first, then review, clear and undecided", () => {
    const findings = [
      finding({ sc: "1.4.3" }),
      finding({ id: 2, key: "f2", sc: "1.4.11", tier: "needs-review" }),
    ];
    const buckets = bucketCriteria(findings, COVERAGE);
    expect(buckets.failed).toEqual(["1.4.3"]);
    expect(buckets.review).toEqual(["1.4.11"]);
    expect(buckets.clear).toEqual(["2.4.7", "2.4.11", "2.4.13", "2.5.8"]);
    expect(buckets.undecided).toEqual(["2.4.12", "2.5.7"]);
  });

  it("does not move a criterion to No issue found because its failure was dismissed away", () => {
    const buckets = bucketCriteria(
      [finding({ status: "dismissed" })],
      COVERAGE,
    );
    expect(buckets.failed).toEqual([]);
    expect(buckets.clear).toContain("1.4.3");
  });
});

describe("grouping", () => {
  const rows = [
    finding({
      id: 1,
      key: "f1",
      element: "div > a",
      bbox: { x: 0, y: 50, w: 5, h: 5 },
    }),
    finding({
      id: 2,
      key: "f2",
      element: "p.story",
      bbox: { x: 0, y: 10, w: 5, h: 5 },
    }),
    finding({
      id: 3,
      key: "f3",
      element: "div > a",
      sc: "2.5.8",
      severity: "minor",
      bbox: { x: 0, y: 60, w: 5, h: 5 },
    }),
    finding({ id: 4, key: "f4", tier: "needs-review", element: "button" }),
  ];

  it("groups by element in reading order of the first finding", () => {
    const groups = groupFindings(rows, "element");
    expect(groups.map((g) => g.id)).toEqual(["p.story", "button", "div > a"]);
    expect(groups[2].findings.map((f) => f.key)).toEqual(["f1", "f3"]);
    expect(groups[0].mono).toBe(true);
  });

  it("groups by severity, drops empty groups and keeps needs review apart", () => {
    const groups = groupFindings(rows, "severity");
    expect(groups.map((g) => g.title)).toEqual([
      "Serious",
      "Minor",
      "Needs review",
    ]);
    expect(groups.flatMap((g) => g.findings)).toHaveLength(rows.length);
  });
});

describe("provenance words", () => {
  it("separates measured from detector-estimated", () => {
    expect(isEstimated({ provenance: "pixel" })).toBe(true);
    expect(isEstimated({ provenance: "rule" })).toBe(false);
    expect(isEstimated({ provenance: "both" })).toBe(false);
    expect(provenanceWords({ provenance: "rule", tier: "automated" })).toBe(
      "Automated · measured",
    );
    expect(provenanceWords({ provenance: "pixel", tier: "needs-review" })).toBe(
      "Check by hand · estimated",
    );
    expect(foundBy({ provenance: "both" })).toBe(
      "Browser rule and pixel measurement",
    );
  });

  it("turns a stored reason into a sentence", () => {
    expect(sentence("text size and weight unknown")).toBe(
      "Text size and weight unknown.",
    );
    expect(sentence("Already ends.")).toBe("Already ends.");
    expect(sentence("  ")).toBeNull();
    expect(sentence(null)).toBeNull();
  });
});

describe("contrast ruler maths", () => {
  it("places 1 at the left end, 7 at the right end and clamps outside", () => {
    expect(rulerPosition(1)).toBe(0);
    expect(rulerPosition(7)).toBeCloseTo(100, 10);
    expect(rulerPosition(0.2)).toBe(0);
    expect(rulerPosition(21)).toBeCloseTo(100, 10);
  });

  it("is logarithmic: 3 sits left of the linear midpoint and 4.5 near 77%", () => {
    expect(rulerPosition(3)).toBeCloseTo(56.46, 1);
    expect(rulerPosition(4.5)).toBeCloseTo(77.3, 1);
  });

  it("spans the gap between the measured value and the requirement", () => {
    const r = ruler({ measured: 4.48, required: 4.5 });
    expect(r.passes).toBe(false);
    expect(r.shortBy).toBe(0.02);
    expect(r.gapLeft).toBeCloseTo(rulerPosition(4.48), 10);
    expect(r.gapWidth).toBeCloseTo(
      rulerPosition(4.5) - rulerPosition(4.48),
      10,
    );
  });

  it("reports a pass without a gap", () => {
    const r = ruler({ measured: 5, required: 4.5 });
    expect(r.passes).toBe(true);
    expect(r.shortBy).toBe(0);
    expect(rulerLabel({ measured: 5, required: 4.5 })).toBe(
      "Measured 5.00:1, required 4.5:1, at or above the required ratio",
    );
    expect(rulerLabel({ measured: 4.48, required: 4.5 })).toBe(
      "Measured 4.48:1, required 4.5:1, short by 0.02",
    );
  });

  it("reads ratios from evidence rows and ignores unusable values", () => {
    expect(parseRatio("4.48:1")).toBe(4.48);
    expect(parseRatio("None:1")).toBeNull();
    expect(parseRatio("16 px")).toBeNull();
    expect(parseRatio(undefined)).toBeNull();
    expect(
      ratioPair([
        { label: "Measured contrast", value: "4.48:1" },
        { label: "Required contrast", value: "4.5:1" },
      ]),
    ).toEqual({ measured: 4.48, required: 4.5 });
    expect(
      ratioPair([
        { label: "Strongest state change", value: "1.2:1" },
        { label: "Required change", value: "3.0:1" },
      ]),
    ).toEqual({ measured: 1.2, required: 3 });
    expect(
      ratioPair([
        { label: "Strongest state change", value: "None:1" },
        { label: "Required change", value: "3.0:1" },
      ]),
    ).toBeNull();
    expect(ratioPair([])).toBeNull();
  });
});

describe("suggested fix diff", () => {
  const rows = [
    { label: "Foreground", value: "#777777" },
    { label: "Background", value: "#FFFFFF" },
  ];

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("nope", "#FFFFFF")).toBeNull();
  });

  it("builds a before and after pair with the ratio change", () => {
    const diff = fixDiff("css", ".element {\n  color: #767676;\n}", rows);
    expect(diff.lines).toEqual([
      { sign: "-", text: "color: #777777;", swatch: "#777777" },
      { sign: "+", text: "color: #767676;", swatch: "#767676" },
    ]);
    expect(diff.change?.before).toBeCloseTo(4.48, 2);
    expect(diff.change?.after).toBeCloseTo(4.54, 2);
    expect(diff.change?.against).toBe("#FFFFFF");
  });

  it("shows only added lines when there is no before value", () => {
    const diff = fixDiff(
      "css",
      ":focus-visible {\n  outline: 2px solid #1d4ed8;\n}",
      [],
    );
    expect(diff.change).toBeNull();
    expect(diff.lines.every((l) => l.sign === "+")).toBe(true);
    expect(diff.lines).toHaveLength(3);
    const html = fixDiff(
      "html",
      '<button aria-label="Close">\n\n</button>',
      [],
    );
    expect(html.lines.map((l) => l.text)).toEqual([
      '<button aria-label="Close">',
      "</button>",
    ]);
  });
});

describe("since last audit", () => {
  const row = (viewport: string) => ({ viewport });
  const delta = {
    fixed: [row("desktop"), row("mobile"), row("mobile")],
    new: [row("mobile")],
    still_present: [row("desktop"), row("mobile")],
    fixes_verified: [row("mobile")],
  };

  it("counts only the viewport on screen", () => {
    expect(deltaCounts(delta, "mobile")).toEqual({
      fixed: 2,
      fresh: 1,
      stillPresent: 1,
      verified: 1,
    });
    expect(deltaCounts(delta, "desktop")).toEqual({
      fixed: 1,
      fresh: 0,
      stillPresent: 1,
      verified: 0,
    });
  });

  it("words the summary and mentions verified fixes only when there are some", () => {
    expect(
      deltaText({ fixed: 3, fresh: 0, stillPresent: 6, verified: 0 }),
    ).toBe("3 fixed · 0 new · 6 still present");
    expect(
      deltaText({ fixed: 3, fresh: 0, stillPresent: 6, verified: 1 }),
    ).toBe("3 fixed · 0 new · 6 still present · 1 fix verified");
    expect(
      deltaText({ fixed: 3, fresh: 0, stillPresent: 6, verified: 2 }),
    ).toContain("2 fixes verified");
  });
});

describe("header facts", () => {
  it("splits an address into host and path", () => {
    expect(
      sourceParts(
        "url",
        "https://marlowegreen.example/about/our-story?x=1",
        undefined,
      ),
    ).toEqual({ host: "marlowegreen.example", path: "/about/our-story?x=1" });
    expect(
      sourceParts("url", "https://marlowegreen.example/", undefined).path,
    ).toBeNull();
  });

  it("falls back to the capture address, then to the folder name", () => {
    expect(
      sourceParts(
        "folder",
        "/data/fixtures/real_com_003",
        "https://a.example/p",
      ),
    ).toEqual({ host: "a.example", path: "/p" });
    expect(sourceParts("folder", "/data/fixtures/real_com_003", "")).toEqual({
      host: "real_com_003",
      path: null,
    });
  });

  it("words the capture time relative to now", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    expect(relativeTime("2026-10-12T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-12T11:48:00Z", now)).toBe("12 min ago");
    expect(relativeTime("2026-10-12T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-10-10T12:00:00Z", now)).toBe("2 days ago");
    expect(relativeTime("not a date", now)).toBe("");
  });
});

describe("placeholder guard", () => {
  it("detects a lone question mark token but not prose", () => {
    expect(hasPlaceholder("at least ? x ? CSS px")).toBe(true);
    expect(hasPlaceholder("min-width: ?px;")).toBe(true);
    expect(hasPlaceholder("a ratio of ?:1")).toBe(true);
    expect(hasPlaceholder("Is this readable?")).toBe(false);
  });

  it("drops only the sentences that contain a placeholder", () => {
    expect(
      withoutPlaceholders(
        "This target is 18 x 18 px. It needs ? px. Make it larger.",
      ),
    ).toBe("This target is 18 x 18 px. Make it larger.");
  });
});

describe("run again body", () => {
  const run: Pick<RunSummary, "condition" | "viewports"> = {
    condition: "hybrid",
    viewports: ["desktop"],
  };
  it("repeats a folder run with its stored condition and no viewports", () => {
    expect(
      runAgainBody({ ...run, source_kind: "folder", source: "/cap/a" }),
    ).toEqual({
      condition: "hybrid",
      max_focus_steps: 15,
      verify_in_browser: false,
      folder: "/cap/a",
    });
  });

  it("repeats a url or upload run with its viewports", () => {
    expect(
      runAgainBody({ ...run, source_kind: "url", source: "https://a.test/" }),
    ).toEqual({
      condition: "hybrid",
      max_focus_steps: 15,
      verify_in_browser: false,
      url: "https://a.test/",
      viewports: ["desktop"],
    });
    expect(
      runAgainBody({ ...run, source_kind: "upload", source: "abc" }),
    ).toMatchObject({
      upload_id: "abc",
      viewports: ["desktop"],
    });
  });
});

describe("run again focus steps", () => {
  const base = {
    condition: "hybrid" as const,
    viewports: ["desktop" as const],
  };
  it("reuses the stored focus steps for every source kind", () => {
    for (const [kind, source] of [
      ["url", "https://a.test/"],
      ["upload", "abc"],
      ["folder", "/cap/a"],
    ] as const)
      expect(
        runAgainBody({
          ...base,
          source_kind: kind,
          source,
          max_focus_steps: 22,
        }),
      ).toMatchObject({ max_focus_steps: 22 });
  });

  it("falls back to 15 when the run has no stored value", () => {
    for (const stored of [null, undefined])
      expect(
        runAgainBody({
          ...base,
          source_kind: "url",
          source: "https://a.test/",
          max_focus_steps: stored,
        }),
      ).toMatchObject({ max_focus_steps: 15 });
  });

  it("names the stored value only when it is known", () => {
    expect(focusStepsFor({ max_focus_steps: 8 })).toBe(8);
    expect(focusStepsFor({ max_focus_steps: null })).toBe(15);
  });
});

describe("upload source label", () => {
  it("names an uploaded run by its date instead of the hash", () => {
    expect(
      sourceParts(
        "upload",
        "8ea5f76e95dd4f7c",
        undefined,
        "2026-10-11T10:00:00Z",
      ),
    ).toEqual({ host: "Uploaded screenshots, 11 Oct", path: null });
  });
});
