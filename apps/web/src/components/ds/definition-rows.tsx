import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DefinitionRows({
  rows,
  className,
}: {
  rows: { label: ReactNode; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl data-ds="definition-rows" className={cn("text-dense", className)}>
      {rows.map((row, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: labels may be nodes
          key={index}
          className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3 border-b border-line py-2 last:border-b-0"
        >
          <dt className="text-ink-3">{row.label}</dt>
          <dd className="m-0 min-w-0 text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
