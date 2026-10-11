export type MeterState = "decided" | "review" | "undecided" | "empty";

export function meterSegments(
  decided: number,
  review: number,
  undecided: number,
  total = 8,
): MeterState[] {
  const clamp = (n: number) => Math.max(0, Math.floor(n));
  const counts: [MeterState, number][] = [
    ["decided", clamp(decided)],
    ["review", clamp(review)],
    ["undecided", clamp(undecided)],
  ];
  const out: MeterState[] = [];
  for (const [state, n] of counts) {
    for (let i = 0; i < n && out.length < total; i++) out.push(state);
  }
  while (out.length < total) out.push("empty");
  return out;
}

export function meterLabel(
  decided: number,
  review: number,
  undecided: number,
  total = 8,
): string {
  const parts = [`${decided} of ${total} criteria decided`];
  if (review > 0) parts.push(`${review} need review`);
  if (undecided > 0) parts.push(`${undecided} could not be decided`);
  return parts.join(", ");
}

export function splitSc(code: string): string[] {
  return code.split(".");
}

export function severityWords(counts: {
  critical: number;
  serious: number;
  minor: number;
}): string {
  return `${counts.critical} critical, ${counts.serious} serious, ${counts.minor} minor`;
}

export function formatRatio(value: number | string, digits = 2): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(digits);
}
