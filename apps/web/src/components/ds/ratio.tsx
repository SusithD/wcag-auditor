import { cn } from "@/lib/utils";
import { formatRatio } from "./helpers";

export function Ratio({
  value,
  digits = 2,
  className,
}: {
  value: number | string;
  digits?: number;
  className?: string;
}) {
  return (
    <span data-ds="ratio" className={cn("num", className)}>
      <b className="font-semibold text-ink">{formatRatio(value, digits)}</b>
      <small aria-hidden="true" className="text-[0.85em] text-ink-3">
        :1
      </small>
      <span className="sr-only"> to 1</span>
    </span>
  );
}
