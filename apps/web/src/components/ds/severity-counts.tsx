import { cn } from "@/lib/utils";
import { Status } from "./status";

const ITEMS = ["critical", "serious", "minor"] as const;

export function SeverityCounts({
  critical,
  serious,
  minor,
  className,
}: {
  critical: number;
  serious: number;
  minor: number;
  className?: string;
}) {
  const counts = { critical, serious, minor };
  return (
    <span
      data-ds="severity-counts"
      className={cn("inline-flex gap-3", className)}
    >
      {ITEMS.map((kind) => (
        <Status
          key={kind}
          kind={kind}
          zero={counts[kind] === 0}
          className="min-w-[3.2ch]"
        >
          <span className="num">{counts[kind]}</span>
          <span className="sr-only"> {kind},</span>
        </Status>
      ))}
    </span>
  );
}
