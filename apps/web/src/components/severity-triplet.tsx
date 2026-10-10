type Counts = {
  critical: number;
  serious: number;
  minor: number;
  needs_review?: number;
};

const ITEMS = [
  { key: "critical", glyph: "●", label: "critical", tone: "text-sev-critical" },
  { key: "serious", glyph: "▲", label: "serious", tone: "text-sev-serious" },
  { key: "minor", glyph: "■", label: "minor", tone: "text-sev-minor" },
] as const;

export function SeverityTriplet({ counts }: { counts: Counts }) {
  const spoken = ITEMS.map((i) => `${counts[i.key]} ${i.label}`).join(", ");
  const review = counts.needs_review ?? 0;
  return (
    <span className="inline-flex items-center gap-2 font-mono text-label">
      <span className="sr-only">
        {spoken}
        {review ? `, ${review} needs review` : ""}
      </span>
      {ITEMS.map((item) => (
        <span
          key={item.key}
          aria-hidden="true"
          className={`inline-flex items-center gap-1 ${item.tone}`}
        >
          <span>{item.glyph}</span>
          <span className="text-foreground">{counts[item.key]}</span>
        </span>
      ))}
      {review ? (
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1 text-sev-review"
        >
          <span>◇</span>
          <span className="text-foreground">{review}</span>
        </span>
      ) : null}
    </span>
  );
}
