import {
  type CoverageCell,
  type Finding,
  readingOrder,
  SC_LIST,
  type SevKey,
  sevKey,
  shortElement,
} from "@/lib/report";

export const SC_LEVELS: Record<string, "A" | "AA" | "AAA"> = {
  "1.4.3": "AA",
  "1.4.11": "AA",
  "2.4.7": "AA",
  "2.4.11": "AA",
  "2.4.12": "AAA",
  "2.4.13": "AAA",
  "2.5.7": "AA",
  "2.5.8": "AA",
};

export { DISMISS_REASONS } from "@/lib/dismiss-reasons";

export type Bucket = "failed" | "review" | "clear" | "undecided";

export const BUCKET_TITLES: Record<Bucket, string> = {
  failed: "Failed",
  review: "Needs review",
  clear: "No issue found",
  undecided: "Could not decide",
};

export const BUCKET_ORDER: Bucket[] = [
  "failed",
  "review",
  "clear",
  "undecided",
];

export type Tally = {
  failures: number;
  critical: number;
  serious: number;
  minor: number;
  review: number;
  dismissed: number;
  decided: number;
  reviewCriteria: number;
  undecided: number;
};

const isDismissed = (f: Finding) => f.status === "dismissed";

export function tally(findings: Finding[], coverage: CoverageCell[]): Tally {
  const out: Tally = {
    failures: 0,
    critical: 0,
    serious: 0,
    minor: 0,
    review: 0,
    dismissed: 0,
    decided: 0,
    reviewCriteria: 0,
    undecided: 0,
  };
  for (const f of findings) {
    if (isDismissed(f)) {
      out.dismissed += 1;
      continue;
    }
    if (f.tier === "needs-review") out.review += 1;
    else if (f.tier === "automated") {
      out.failures += 1;
      out[f.severity] += 1;
    }
  }
  const verdicts = new Map(coverage.map((c) => [c.sc, c.hybrid_verdict]));
  for (const sc of SC_LIST) {
    const verdict = verdicts.get(sc);
    if (verdict === "automated") out.decided += 1;
    else if (verdict === "needs-review") out.reviewCriteria += 1;
    else out.undecided += 1;
  }
  return out;
}

export type VerdictPart = { text: string; strong: boolean };

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function verdictSentence(t: Tally): VerdictPart[] {
  const parts: VerdictPart[] = [];
  const push = (text: string, strong = false) => parts.push({ text, strong });
  if (t.decided === 0) {
    push("No criterion", true);
    push(" could be decided automatically on this page");
    if (t.failures > 0) {
      push(", but ");
      push(plural(t.failures, "failure was", "failures were"), true);
      push(" found");
    }
    push(". ");
  } else if (t.failures > 0) {
    push(plural(t.failures, "failure", "failures"), true);
    push(
      ` in the ${plural(t.decided, "criterion", "criteria")} the tool could decide. `,
    );
  } else {
    push("No failures", true);
    push(
      ` in the ${plural(t.decided, "criterion", "criteria")} the tool could decide. `,
    );
  }
  if (t.review > 0) {
    push(plural(t.review, "finding", "findings"), true);
    push(t.review === 1 ? " needs review, and " : " need review, and ");
  } else {
    push("No findings", true);
    push(" need review, and ");
  }
  if (t.undecided > 0) {
    push(plural(t.undecided, "criterion", "criteria"), true);
    push(" could not be decided on this page.");
  } else {
    push("no criterion", true);
    push(" was left undecided.");
  }
  return parts;
}

export function verdictText(t: Tally): string {
  return verdictSentence(t)
    .map((p) => p.text)
    .join("");
}

export type DeltaCounts = {
  fixed: number;
  fresh: number;
  stillPresent: number;
  verified: number;
};

export function deltaCounts(
  delta: {
    fixed: { viewport: string }[];
    new: { viewport: string }[];
    still_present: { viewport: string }[];
    fixes_verified: { viewport: string }[];
  },
  viewport: string,
): DeltaCounts {
  const n = (rows: { viewport: string }[]) =>
    rows.filter((r) => r.viewport === viewport).length;
  return {
    fixed: n(delta.fixed),
    fresh: n(delta.new),
    stillPresent: n(delta.still_present),
    verified: n(delta.fixes_verified),
  };
}

export function deltaText(d: DeltaCounts): string {
  const base = `${d.fixed} fixed · ${d.fresh} new · ${d.stillPresent} still present`;
  return d.verified > 0
    ? `${base} · ${plural(d.verified, "fix", "fixes")} verified`
    : base;
}

export function bucketOf(
  sc: string,
  findings: Finding[],
  coverage: CoverageCell[],
): Bucket {
  const own = findings.filter((f) => f.sc === sc && !isDismissed(f));
  if (own.some((f) => f.tier === "automated")) return "failed";
  if (own.some((f) => f.tier === "needs-review")) return "review";
  const verdict = coverage.find((c) => c.sc === sc)?.hybrid_verdict;
  if (verdict === "automated") return "clear";
  if (verdict === "needs-review") return "review";
  return "undecided";
}

export function bucketCriteria(
  findings: Finding[],
  coverage: CoverageCell[],
): Record<Bucket, string[]> {
  const out: Record<Bucket, string[]> = {
    failed: [],
    review: [],
    clear: [],
    undecided: [],
  };
  for (const sc of SC_LIST) out[bucketOf(sc, findings, coverage)].push(sc);
  return out;
}

export type GroupBy = "criterion" | "element" | "severity";

export type FindingGroup = {
  id: string;
  title: string;
  mono: boolean;
  findings: Finding[];
};

const SEV_GROUPS: { key: SevKey; title: string }[] = [
  { key: "critical", title: "Critical" },
  { key: "serious", title: "Serious" },
  { key: "minor", title: "Minor" },
  { key: "needs-review", title: "Needs review" },
];

export function groupFindings(
  findings: Finding[],
  by: Exclude<GroupBy, "criterion">,
): FindingGroup[] {
  if (by === "severity") {
    return SEV_GROUPS.map(({ key, title }) => ({
      id: key,
      title,
      mono: false,
      findings: readingOrder(findings.filter((f) => sevKey(f) === key)),
    })).filter((g) => g.findings.length > 0);
  }
  const groups = new Map<string, FindingGroup>();
  for (const f of readingOrder(findings)) {
    const title = shortElement(f.element, 48);
    const existing = groups.get(f.element);
    if (existing) existing.findings.push(f);
    else
      groups.set(f.element, {
        id: f.element,
        title,
        mono: true,
        findings: [f],
      });
  }
  return [...groups.values()];
}

export function isEstimated(f: Pick<Finding, "provenance">): boolean {
  return f.provenance === "pixel";
}

export function foundBy(f: Pick<Finding, "provenance">): string {
  if (f.provenance === "rule") return "Browser rule";
  if (f.provenance === "pixel") return "Pixel measurement on a detector box";
  return "Browser rule and pixel measurement";
}

export function provenanceWords(
  f: Pick<Finding, "provenance" | "tier">,
): string {
  const tier = f.tier === "needs-review" ? "Check by hand" : "Automated";
  return `${tier} · ${isEstimated(f) ? "estimated" : "measured"}`;
}

export function sentence(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

export function parseRatio(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(\d+(?:\.\d+)?):1\s*$/.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type RatioPair = { measured: number; required: number };

export function ratioPair(
  rows: { label: string; value: string }[],
): RatioPair | null {
  const find = (label: string) =>
    parseRatio(rows.find((r) => r.label === label)?.value);
  const measured = find("Measured contrast") ?? find("Strongest state change");
  const required = find("Required contrast") ?? find("Required change");
  if (measured === null || required === null) return null;
  return { measured, required };
}

export const RULER_MIN = 1;
export const RULER_MAX = 7;
export const RULER_TICKS = [1, 3, 4.5, 7] as const;

export function rulerPosition(value: number): number {
  const clamped = Math.min(RULER_MAX, Math.max(RULER_MIN, value));
  return (
    ((Math.log(clamped) - Math.log(RULER_MIN)) /
      (Math.log(RULER_MAX) - Math.log(RULER_MIN))) *
    100
  );
}

export type Ruler = {
  measured: number;
  required: number;
  gapLeft: number;
  gapWidth: number;
  passes: boolean;
  shortBy: number;
};

export function ruler({ measured, required }: RatioPair): Ruler {
  const pm = rulerPosition(measured);
  const pr = rulerPosition(required);
  return {
    measured: pm,
    required: pr,
    gapLeft: Math.min(pm, pr),
    gapWidth: Math.abs(pr - pm),
    passes: measured >= required,
    shortBy: Math.max(0, Math.round((required - measured) * 100) / 100),
  };
}

export function rulerLabel(pair: RatioPair): string {
  const r = ruler(pair);
  const m = pair.measured.toFixed(2);
  const q = pair.required.toString();
  return r.passes
    ? `Measured ${m} to 1, required ${q} to 1, meets the requirement`
    : `Measured ${m} to 1, required ${q} to 1, short by ${r.shortBy.toFixed(2)}`;
}

function channel(hex: number): number {
  const c = hex / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type DiffLine = { sign: "-" | "+"; text: string; swatch: string | null };

export type FixDiff = {
  lines: DiffLine[];
  change: { before: number; after: number; against: string } | null;
};

const HEX = /#[0-9a-f]{6}/i;

function cssLines(code: string): string[] {
  return code
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function fixDiff(
  format: "css" | "html",
  code: string,
  rows: { label: string; value: string }[],
): FixDiff {
  const value = (label: string) =>
    rows
      .find((r) => r.label === label)
      ?.value.trim()
      .toUpperCase() ?? null;
  if (format === "css") {
    const fg = value("Foreground");
    const bg = value("Background");
    const next = /(?:^|\n)\s*(?:color|border-color)\s*:\s*(#[0-9a-f]{6})/i.exec(
      code,
    );
    const hexFg = fg && HEX.test(fg) ? fg : null;
    const hexBg = bg && HEX.test(bg) ? bg : null;
    if (hexFg && hexBg && next) {
      const after = next[1].toUpperCase();
      const before = contrastRatio(hexFg, hexBg);
      const now = contrastRatio(after, hexBg);
      const property = /border/i.test(next[0]) ? "border-color" : "color";
      return {
        lines: [
          { sign: "-", text: `${property}: ${hexFg};`, swatch: hexFg },
          { sign: "+", text: `${property}: ${after};`, swatch: after },
        ],
        change:
          before !== null && now !== null
            ? { before, after: now, against: hexBg }
            : null,
      };
    }
  }
  const lines = format === "css" ? cssLines(code) : code.split("\n");
  return {
    lines: lines
      .filter((l) => l.trim() !== "")
      .map((text) => ({
        sign: "+" as const,
        text: format === "css" ? text : text.replace(/\s+$/, ""),
        swatch: null,
      })),
    change: null,
  };
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(then).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type SourceParts = { host: string; path: string | null };

export function sourceParts(
  kind: string,
  source: string,
  overviewUrl: string | undefined,
): SourceParts {
  const tryUrl = (value: string | undefined) => {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  };
  const url = kind === "url" ? tryUrl(source) : tryUrl(overviewUrl);
  if (url) {
    const path = `${url.pathname}${url.search}`;
    return { host: url.host, path: path === "/" ? null : path };
  }
  const label = source.split("/").filter(Boolean).pop() ?? source;
  return { host: label, path: null };
}

export const VIEWPORT_SIZE = {
  desktop: "Desktop, 1440 × 900 px",
  mobile: "Mobile, 390 × 844 px",
} as const;
