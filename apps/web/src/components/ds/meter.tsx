import { cn } from "@/lib/utils";
import { type MeterState, meterLabel, meterSegments } from "./helpers";

const SEGMENT: Record<MeterState, string> = {
  decided: "bg-accent",
  review: "bg-review",
  undecided:
    "bg-[repeating-linear-gradient(135deg,var(--line-strong)_0_2px,transparent_2px_4px)]",
  empty: "bg-track",
};

export function Meter({
  decided,
  review = 0,
  undecided = 0,
  total = 8,
  label,
  className,
}: {
  decided: number;
  review?: number;
  undecided?: number;
  total?: number;
  label?: string;
  className?: string;
}) {
  const segments = meterSegments(decided, review, undecided, total);
  const seen: Record<string, number> = {};
  const keyed = segments.map((state) => {
    seen[state] = (seen[state] ?? 0) + 1;
    return { state, key: `${state}-${seen[state]}` };
  });
  return (
    <span
      role="img"
      aria-label={label ?? meterLabel(decided, review, undecided, total)}
      data-ds="meter"
      className={cn("flex w-full gap-0.5", className)}
    >
      {keyed.map(({ state, key }) => (
        <i
          key={key}
          data-state={state}
          className={cn("h-1.5 flex-1 rounded-sm", SEGMENT[state])}
        />
      ))}
    </span>
  );
}
