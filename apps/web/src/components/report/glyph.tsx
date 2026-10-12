import { SHAPES } from "@/components/ds";

type Kind = "critical" | "serious" | "minor" | "review";

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
      {SHAPES[kind]}
    </g>
  );
}

export function kindOf(
  key: "critical" | "serious" | "minor" | "needs-review",
): Kind {
  return key === "needs-review" ? "review" : key;
}
