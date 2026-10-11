import type { ShapeKind } from "@/components/ds";
import { type Finding, sevKey } from "@/lib/report";

export type Verdict = "automated" | "needs-review" | "not-assessable" | "none";
export type Channel = "rule" | "pixel" | "hybrid";

export const CHANNELS: { key: Channel; label: string }[] = [
  { key: "rule", label: "Rule channel" },
  { key: "pixel", label: "Pixel channel" },
  { key: "hybrid", label: "Hybrid" },
];

export const SC_LEVEL: Record<string, "A" | "AA" | "AAA"> = {
  "1.4.3": "AA",
  "1.4.11": "AA",
  "2.4.7": "AA",
  "2.4.11": "AA",
  "2.4.12": "AAA",
  "2.4.13": "AAA",
  "2.5.7": "AA",
  "2.5.8": "AA",
};

export type CoverageState =
  | "failed"
  | "review"
  | "pass"
  | "undecided"
  | "no-verdict";

export const STATE_WORD: Record<CoverageState, string> = {
  failed: "Failed",
  review: "Needs review",
  pass: "No issue found",
  undecided: "Could not decide",
  "no-verdict": "No verdict",
};

export const STATE_SHAPE: Record<CoverageState, ShapeKind> = {
  failed: "failed",
  review: "review",
  pass: "pass",
  undecided: "undecided",
  "no-verdict": "undecided",
};

export function findingsFor(
  findings: Finding[],
  sc: string,
  channel: Channel,
): Finding[] {
  return findings.filter(
    (f) =>
      f.sc === sc &&
      (channel === "hybrid" ||
        f.provenance === "both" ||
        (channel === "rule"
          ? f.provenance === "rule"
          : f.provenance === "pixel")),
  );
}

export function stateFor(verdict: Verdict, found: Finding[]): CoverageState {
  const failures = found.filter((f) => sevKey(f) !== "needs-review").length;
  if (failures > 0) return "failed";
  if (verdict === "needs-review" || found.length > 0) return "review";
  if (verdict === "automated") return "pass";
  if (verdict === "not-assessable") return "undecided";
  return "no-verdict";
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export type MeterCounts = {
  decided: number;
  review: number;
  undecided: number;
};

export function meterFor(verdicts: Verdict[]): MeterCounts {
  return {
    decided: verdicts.filter((v) => v === "automated").length,
    review: verdicts.filter((v) => v === "needs-review").length,
    undecided: verdicts.filter((v) => v === "not-assessable" || v === "none")
      .length,
  };
}
