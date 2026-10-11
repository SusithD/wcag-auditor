import type { components } from "@/api/types";

export type Finding = components["schemas"]["FindingOut"];
export type Overview = components["schemas"]["Overview"];
export type ExportInfo = components["schemas"]["ExportInfo"];
export type Viewport = Overview["viewport"];
export type CoverageCell = components["schemas"]["CoverageCellOut"];
export type SevKey = "critical" | "serious" | "minor" | "needs-review";

export const SC_TITLES: Record<string, string> = {
  "1.4.3": "Contrast (Minimum)",
  "1.4.11": "Non-text Contrast",
  "2.4.7": "Focus Visible",
  "2.4.11": "Focus Not Obscured (Minimum)",
  "2.4.12": "Focus Not Obscured (Enhanced)",
  "2.4.13": "Focus Appearance",
  "2.5.7": "Dragging Movements",
  "2.5.8": "Target Size (Minimum)",
};
export const SC_LIST = Object.keys(SC_TITLES);

export const SEV_GLYPH: Record<SevKey, string> = {
  critical: "●",
  serious: "▲",
  minor: "■",
  "needs-review": "◇",
};
export const SEV_LABEL: Record<SevKey, string> = {
  critical: "Critical",
  serious: "Serious",
  minor: "Minor",
  "needs-review": "Needs review",
};
export const SEV_DASH: Record<SevKey, string | undefined> = {
  critical: undefined,
  serious: "8 4",
  minor: "2 3",
  "needs-review": undefined,
};
export const SEV_ORDER: Record<SevKey, number> = {
  critical: 0,
  serious: 1,
  minor: 2,
  "needs-review": 3,
};
export const PROV_GLYPH = {
  rule: "◐",
  pixel: "◑",
  both: "●",
  none: "○",
} as const;
export const PROV_LABEL = {
  rule: "Rule",
  pixel: "Pixel",
  both: "Both",
  none: "No verdict",
} as const;
export const TIER_LABEL = {
  automated: "Automated",
  "needs-review": "Needs review",
  "not-assessable": "Not assessable",
} as const;

export function sevKey(f: Pick<Finding, "severity" | "tier">): SevKey {
  return f.tier === "needs-review" ? "needs-review" : f.severity;
}

export function compareFindings(a: Finding, b: Finding): number {
  return (
    SC_LIST.indexOf(a.sc) - SC_LIST.indexOf(b.sc) ||
    SEV_ORDER[sevKey(a)] - SEV_ORDER[sevKey(b)] ||
    (a.bbox?.y ?? 0) - (b.bbox?.y ?? 0) ||
    (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0) ||
    a.key.localeCompare(b.key)
  );
}

export function readingOrder(findings: Finding[]): Finding[] {
  const area = (f: Finding) => (f.bbox?.w ?? 0) * (f.bbox?.h ?? 0);
  return [...findings].sort(
    (a, b) =>
      (a.bbox?.y ?? Number.MAX_SAFE_INTEGER) -
        (b.bbox?.y ?? Number.MAX_SAFE_INTEGER) ||
      (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0) ||
      area(b) - area(a) ||
      a.key.localeCompare(b.key),
  );
}

export type ReportView = "canvas" | "table";
export type ReportState = {
  vp: Viewport | null;
  sc: string[];
  sev: SevKey[];
  prov: string[];
  tier: string[];
  f: string | null;
  view: ReportView;
  q: string;
};

export const EMPTY_STATE: ReportState = {
  vp: null,
  sc: [],
  sev: [],
  prov: [],
  tier: [],
  f: null,
  view: "canvas",
  q: "",
};

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function parseState(params: URLSearchParams): ReportState {
  const vp = params.get("vp");
  const view = params.get("view");
  return {
    vp: vp === "desktop" || vp === "mobile" ? vp : null,
    sc: list(params.get("sc")).filter((s) => s in SC_TITLES),
    sev: list(params.get("sev")).filter((s): s is SevKey => s in SEV_LABEL),
    prov: list(params.get("prov")).filter((s) =>
      ["rule", "pixel", "both"].includes(s),
    ),
    tier: list(params.get("tier")).filter((s) => s in TIER_LABEL),
    f: params.get("f"),
    view: view === "table" ? "table" : "canvas",
    q: params.get("q") ?? "",
  };
}

export function serialiseState(state: ReportState): string {
  const p = new URLSearchParams();
  if (state.vp) p.set("vp", state.vp);
  if (state.sc.length) p.set("sc", state.sc.join(","));
  if (state.sev.length) p.set("sev", state.sev.join(","));
  if (state.prov.length) p.set("prov", state.prov.join(","));
  if (state.tier.length) p.set("tier", state.tier.join(","));
  if (state.f) p.set("f", state.f);
  if (state.view !== "canvas") p.set("view", state.view);
  if (state.q) p.set("q", state.q);
  return p.toString();
}

export function applyFilters(findings: Finding[], s: ReportState): Finding[] {
  const q = s.q.trim().toLowerCase();
  return findings.filter(
    (f) =>
      (s.sc.length === 0 || s.sc.includes(f.sc)) &&
      (s.sev.length === 0 || s.sev.includes(sevKey(f))) &&
      (s.prov.length === 0 || s.prov.includes(f.provenance)) &&
      (s.tier.length === 0 || s.tier.includes(f.tier)) &&
      (q === "" ||
        `${f.sc} ${SC_TITLES[f.sc] ?? ""} ${f.element} ${f.key}`
          .toLowerCase()
          .includes(q)),
  );
}

export type Counts = Record<SevKey, number>;

export function countBySev(findings: Finding[]): Counts {
  const out: Counts = { critical: 0, serious: 0, minor: 0, "needs-review": 0 };
  for (const f of findings) out[sevKey(f)] += 1;
  return out;
}

export type Transform = { x: number; y: number; scale: number };

export function fitTransform(
  box: { x: number; y: number; w: number; h: number },
  container: { w: number; h: number },
  margin = 48,
  maxScale = 4,
  minScale = 0.05,
): Transform {
  const w = Math.max(box.w, 1);
  const h = Math.max(box.h, 1);
  const scale = Math.min(
    maxScale,
    Math.max(
      minScale,
      Math.min((container.w - margin * 2) / w, (container.h - margin * 2) / h),
    ),
  );
  return {
    scale,
    x: container.w / 2 - (box.x + box.w / 2) * scale,
    y: container.h / 2 - (box.y + box.h / 2) * scale,
  };
}

export function fitWidth(contentW: number, container: { w: number }): number {
  return Math.min(1, container.w / Math.max(contentW, 1));
}

export function scoreSegments(score: number): number {
  return Math.max(0, Math.min(4, Math.round(score * 4)));
}

export function swatches(rows: { label: string; value: string }[]) {
  return rows
    .filter((r) => /^#[0-9a-f]{6}$/i.test(r.value.trim()))
    .map((r) => ({ label: r.label, hex: r.value.trim().toUpperCase() }));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function diffPixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
    );
    const changed = d > 8;
    out[i] = changed ? 220 : 245;
    out[i + 1] = changed ? 38 : 245;
    out[i + 2] = changed ? 38 : 245;
    out[i + 3] = 255;
  }
  return out;
}

const NO_CHANGE = "no measurable change";

export function plainText(text: string): string {
  return text.replace(/\bNone:1\b/g, NO_CHANGE);
}

export function plainValue(value: string): string {
  return value.trim() === "None:1" ? "No measurable change" : plainText(value);
}

export function shortElement(element: string, max = 40): string {
  const last = element.split(">").pop()?.trim() || element;
  return last.length > max ? `${last.slice(0, max - 1)}…` : last;
}

export function scTitle(f: Pick<Finding, "sc">): string {
  return `${f.sc} ${SC_TITLES[f.sc] ?? ""}`.trim();
}

export function measureText(f: Finding): string {
  const row = f.evidence_rows[0];
  if (!row) return "";
  if (row.value.trim() === "None:1") return NO_CHANGE;
  return `${row.label.charAt(0).toLowerCase()}${row.label.slice(1)} ${plainText(row.value)}`;
}

export function ariaLabel(f: Finding, n?: number, total?: number): string {
  const parts = [scTitle(f), SEV_LABEL[sevKey(f)], measureText(f)];
  if (n && total) parts.push(`${n} of ${total}`);
  return parts.filter(Boolean).join(", ");
}

export function rowLabel(f: Finding): string {
  return `Select ${scTitle(f)}, ${SEV_LABEL[sevKey(f)]}, ${shortElement(f.element)}`;
}

export function selectionMessage(
  f: Finding,
  index: number,
  total: number,
): string {
  const position = index >= 0 ? ` ${index + 1} of ${total}.` : "";
  return `Selected ${scTitle(f)}, ${SEV_LABEL[sevKey(f)]}. Details shown.${position}`;
}

export function filterMessage(count: number): string {
  return `Showing ${count} ${count === 1 ? "finding" : "findings"}`;
}

export function cycle<T>(
  items: T[],
  index: number,
  step: number,
): T | undefined {
  if (items.length === 0) return undefined;
  return items[(index + step + items.length) % items.length];
}

export function verdictProvenance(
  cell: CoverageCell | undefined,
): "rule" | "pixel" | "both" | "none" {
  if (!cell) return "none";
  const rule =
    cell.rule_verdict === "automated" || cell.rule_verdict === "needs-review";
  const pixel =
    cell.pixel_verdict === "automated" || cell.pixel_verdict === "needs-review";
  if (rule && pixel) return "both";
  if (rule) return "rule";
  if (pixel) return "pixel";
  return "none";
}
