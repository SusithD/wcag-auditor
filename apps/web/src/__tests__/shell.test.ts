import { describe, expect, it } from "vitest";
import {
  defaultCrumbs,
  filterPalette,
  isParticipantRoute,
  PRIMARY_NAV,
  recentSites,
  runLabel,
  stepIndex,
} from "@/lib/shell";

describe("isParticipantRoute", () => {
  it("hides the sidebar on participant pages only", () => {
    expect(isParticipantRoute("/study")).toBe(true);
    expect(isParticipantRoute("/study/ABC123")).toBe(true);
    expect(isParticipantRoute("/study/admin")).toBe(false);
    expect(isParticipantRoute("/eval")).toBe(false);
    expect(isParticipantRoute("/")).toBe(false);
  });
});

describe("nav matching", () => {
  const audits = PRIMARY_NAV.find((n) => n.key === "audits");
  it("keeps Audits active on run pages", () => {
    expect(audits?.match("/runs/abc/coverage")).toBe(true);
    expect(audits?.match("/audits")).toBe(true);
    expect(audits?.match("/sites")).toBe(false);
  });
  it("matches Overview exactly", () => {
    expect(PRIMARY_NAV[0].match("/")).toBe(true);
    expect(PRIMARY_NAV[0].match("/audits")).toBe(false);
  });
});

describe("defaultCrumbs", () => {
  it("builds run crumbs", () => {
    expect(defaultCrumbs("/runs/x/compare")).toEqual([
      { label: "Audits", href: "/audits" },
      { label: "Audit report", href: "/runs/x" },
      { label: "Compare" },
    ]);
    expect(defaultCrumbs("/")).toEqual([{ label: "Overview" }]);
    expect(defaultCrumbs("/nowhere")).toEqual([]);
  });
});

describe("recentSites", () => {
  it("keeps the first three distinct hosts", () => {
    const runs = [
      { id: "1", source_kind: "url", source: "https://www.a.example/x" },
      { id: "2", source_kind: "url", source: "https://a.example/y" },
      { id: "3", source_kind: "upload", source: "u" },
      { id: "4", source_kind: "url", source: "https://b.example" },
      { id: "5", source_kind: "folder", source: "/data/c_capture" },
      { id: "6", source_kind: "url", source: "https://d.example" },
    ];
    expect(recentSites(runs)).toEqual([
      { host: "a.example", runId: "1" },
      { host: "b.example", runId: "4" },
      { host: "c_capture", runId: "5" },
    ]);
  });
});

describe("palette helpers", () => {
  const items = [
    { id: "a", group: "Go to", label: "Review queue" },
    { id: "b", group: "Actions", label: "New audit" },
  ];
  it("filters on every term", () => {
    expect(filterPalette(items, "rev que").map((i) => i.id)).toEqual(["a"]);
    expect(filterPalette(items, "")).toHaveLength(2);
    expect(filterPalette(items, "zzz")).toEqual([]);
  });
  it("wraps the active index", () => {
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
  it("labels runs", () => {
    expect(runLabel({ source_kind: "url", source: "https://x.io/p" })).toBe(
      "x.io/p",
    );
    expect(runLabel({ source_kind: "upload", source: "" })).toBe(
      "Uploaded screenshots",
    );
  });
});
