import { describe, expect, it } from "vitest";
import {
  applyFilters,
  ariaLabel,
  countBySev,
  cycle,
  diffPixels,
  EMPTY_STATE,
  type Finding,
  fitTransform,
  formatBytes,
  parseState,
  readingOrder,
  scoreSegments,
  serialiseState,
  sevKey,
  swatches,
} from "@/lib/report";

function finding(over: Partial<Finding>): Finding {
  return {
    id: 1,
    key: "f001",
    viewport: "desktop",
    sc: "1.4.3",
    bbox: { x: 10, y: 10, w: 100, h: 20 },
    focus_index: null,
    severity: "serious",
    tier: "automated",
    score: 0.9,
    provenance: "rule",
    element: "h2",
    guidance: null,
    evidence_rows: [{ label: "Measured contrast", value: "2.05:1" }],
    has_crop: true,
    status: "open",
    ...over,
  };
}

describe("severity and ordering", () => {
  it("treats needs-review tier as its own level whatever the severity", () => {
    expect(
      sevKey(finding({ tier: "needs-review", severity: "critical" })),
    ).toBe("needs-review");
    expect(sevKey(finding({ severity: "minor" }))).toBe("minor");
  });

  it("orders boxes top to bottom, left to right, boxless last", () => {
    const a = finding({ key: "f1", bbox: { x: 50, y: 5, w: 1, h: 1 } });
    const b = finding({ key: "f2", bbox: { x: 5, y: 5, w: 1, h: 1 } });
    const c = finding({ key: "f3", bbox: null });
    const d = finding({ key: "f4", bbox: { x: 0, y: 1, w: 1, h: 1 } });
    expect(readingOrder([a, b, c, d]).map((f) => f.key)).toEqual([
      "f4",
      "f2",
      "f1",
      "f3",
    ]);
  });

  it("cycles with wrap-around and copes with an empty list", () => {
    expect(cycle([1, 2, 3], 0, -1)).toBe(3);
    expect(cycle([1, 2, 3], 2, 1)).toBe(1);
    expect(cycle([], 0, 1)).toBeUndefined();
  });
});

describe("URL state", () => {
  it("round-trips every field", () => {
    const state = {
      ...EMPTY_STATE,
      vp: "mobile" as const,
      sc: ["1.4.3", "2.4.7"],
      sev: ["critical" as const],
      prov: ["both"],
      tier: ["automated"],
      f: "f007",
      view: "table" as const,
      q: "button",
    };
    expect(parseState(new URLSearchParams(serialiseState(state)))).toEqual(
      state,
    );
  });

  it("drops unknown values and defaults to the canvas", () => {
    const parsed = parseState(
      new URLSearchParams("vp=tablet&sc=9.9.9,1.4.3&sev=bad&view=weird"),
    );
    expect(parsed).toEqual({ ...EMPTY_STATE, sc: ["1.4.3"] });
    expect(serialiseState(EMPTY_STATE)).toBe("");
  });
});

describe("filters and counts", () => {
  const rows = [
    finding({ key: "a", sc: "1.4.3", provenance: "rule" }),
    finding({
      key: "b",
      sc: "2.4.7",
      provenance: "pixel",
      tier: "needs-review",
      element: "nav a",
    }),
    finding({
      key: "c",
      sc: "2.4.7",
      provenance: "both",
      severity: "critical",
    }),
  ];
  it("combines facets with AND and values within a facet with OR", () => {
    expect(
      applyFilters(rows, { ...EMPTY_STATE, sc: ["2.4.7"] }).map((f) => f.key),
    ).toEqual(["b", "c"]);
    expect(
      applyFilters(rows, {
        ...EMPTY_STATE,
        sc: ["2.4.7"],
        sev: ["critical"],
      }).map((f) => f.key),
    ).toEqual(["c"]);
    expect(
      applyFilters(rows, { ...EMPTY_STATE, prov: ["rule", "pixel"] }).map(
        (f) => f.key,
      ),
    ).toEqual(["a", "b"]);
    expect(
      applyFilters(rows, { ...EMPTY_STATE, sev: ["needs-review"] }).map(
        (f) => f.key,
      ),
    ).toEqual(["b"]);
  });
  it("searches criterion, title, element and key", () => {
    expect(
      applyFilters(rows, { ...EMPTY_STATE, q: "NAV" }).map((f) => f.key),
    ).toEqual(["b"]);
    expect(
      applyFilters(rows, { ...EMPTY_STATE, q: "focus visible" }).map(
        (f) => f.key,
      ),
    ).toEqual(["b", "c"]);
  });
  it("counts per severity level", () => {
    expect(countBySev(rows)).toEqual({
      critical: 1,
      serious: 1,
      minor: 0,
      "needs-review": 1,
    });
  });
});

describe("geometry", () => {
  it("fits a box into the container with a margin and centres it", () => {
    const t = fitTransform(
      { x: 100, y: 200, w: 200, h: 100 },
      { w: 1000, h: 600 },
      48,
    );
    expect(t.scale).toBeCloseTo(
      Math.min((1000 - 96) / 200, (600 - 96) / 100, 4),
    );
    expect(t.x + (100 + 100) * t.scale).toBeCloseTo(500);
    expect(t.y + (200 + 50) * t.scale).toBeCloseTo(300);
  });
  it("caps the zoom for tiny boxes and floors it for huge ones", () => {
    expect(
      fitTransform({ x: 0, y: 0, w: 1, h: 1 }, { w: 1000, h: 800 }).scale,
    ).toBe(4);
    expect(
      fitTransform({ x: 0, y: 0, w: 100000, h: 100000 }, { w: 1000, h: 800 })
        .scale,
    ).toBe(0.05);
  });
});

describe("evidence helpers", () => {
  it("extracts hex swatches only", () => {
    expect(
      swatches([
        { label: "Foreground", value: "#aed6f1" },
        { label: "Measured contrast", value: "2.05:1" },
        { label: "Background", value: "#3498DB" },
      ]),
    ).toEqual([
      { label: "Foreground", hex: "#AED6F1" },
      { label: "Background", hex: "#3498DB" },
    ]);
  });
  it("maps score to four segments", () => {
    expect([0, 0.12, 0.5, 0.9, 1].map(scoreSegments)).toEqual([0, 0, 2, 4, 4]);
  });
  it("labels boxes with criterion, severity, first measurement and element", () => {
    expect(ariaLabel(finding({}))).toBe(
      "1.4.3 Contrast (Minimum), Serious, measured contrast 2.05:1, h2",
    );
  });
  it("formats sizes", () => {
    expect([512, 2048, 5 * 1024 * 1024].map(formatBytes)).toEqual([
      "512 B",
      "2 KB",
      "5.0 MB",
    ]);
  });
  it("marks only differing pixels in the diff image", () => {
    const a = new Uint8ClampedArray([10, 10, 10, 255, 0, 0, 0, 255]);
    const b = new Uint8ClampedArray([10, 10, 12, 255, 90, 0, 0, 255]);
    const d = diffPixels(a, b);
    expect(Array.from(d.slice(0, 3))).toEqual([245, 245, 245]);
    expect(Array.from(d.slice(4, 7))).toEqual([220, 38, 38]);
  });
});
