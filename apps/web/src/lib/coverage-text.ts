export type TextSegment = { text: string; strong: boolean; at: number };

export function plainWording(value: string): string {
  return value
    .replace(/\(RQ\d+\)/g, "")
    .replace(/^Coverage claim\s*:?/, "Coverage summary:")
    .replace(/\(\+DOM\)/g, "(plus the page's HTML)")
    .replace(
      /(?:rule: )?axe `?color-contrast`?;\s*pixel: module/g,
      "rule channel: axe contrast check; pixel channel: our own measurement",
    )
    .replace(/the rule-only configuration/g, "Rules only")
    .replace(/the hybrid configuration/g, "Detector and rules")
    .replace(/needs-review/g, "needs review")
    .replace(/not-assessable/g, "not assessable")
    .replace(/\s{2,}/g, " ")
    .replace(/Coverage summary:\s*:/, "Coverage summary:")
    .trim();
}

export function emphasisSegments(value: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const parts = value.split(/\*\*([^*]+)\*\*/);
  let at = 0;
  parts.forEach((text, i) => {
    if (text) segments.push({ text, strong: i % 2 === 1, at });
    at += text.length;
  });
  return segments;
}

export function stripEmphasis(value: string): string {
  return emphasisSegments(value)
    .map((s) => s.text)
    .join("");
}
