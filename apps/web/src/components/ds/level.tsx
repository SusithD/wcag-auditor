import { cn } from "@/lib/utils";

export function Level({
  level,
  className,
}: {
  level: "A" | "AA" | "AAA";
  className?: string;
}) {
  return (
    <span
      data-ds="level"
      className={cn(
        "rounded-[3px] border border-line px-1 font-mono text-xs/4 font-medium text-ink-3",
        className,
      )}
    >
      <span className="sr-only">Level </span>
      {level}
    </span>
  );
}
