type Kind = "critical" | "serious" | "minor" | "review";

const PATHS: Record<Kind, React.ReactNode> = {
  critical: <path d="M6 .6 11.4 6 6 11.4.6 6z" fill="currentColor" />,
  serious: <path d="M6 .9l5.4 10H.6z" fill="currentColor" />,
  minor: (
    <rect
      x="1.75"
      y="1.75"
      width="8.5"
      height="8.5"
      rx="1"
      fill="currentColor"
    />
  ),
  review: (
    <>
      <circle
        cx="6"
        cy="6"
        r="4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="6" cy="6" r="1.6" fill="currentColor" />
    </>
  ),
};

export function SvgGlyph({
  kind,
  x,
  y,
  size,
  color,
}: {
  kind: Kind;
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 12})`} style={{ color }}>
      {PATHS[kind]}
    </g>
  );
}

export function kindOf(
  key: "critical" | "serious" | "minor" | "needs-review",
): Kind {
  return key === "needs-review" ? "review" : key;
}
