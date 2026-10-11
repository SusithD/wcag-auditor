import Link from "next/link";
import { cn } from "@/lib/utils";

export type RunView = "report" | "table" | "compare" | "coverage";

const ITEMS: { key: RunView; label: string }[] = [
  { key: "report", label: "Findings" },
  { key: "table", label: "Table" },
  { key: "compare", label: "Compare with rules only" },
  { key: "coverage", label: "Coverage" },
];

export function runViewHref(runId: string, view: RunView, query = ""): string {
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  params.delete("view");
  if (view === "table") params.set("view", "table");
  const path =
    view === "compare" || view === "coverage"
      ? `/runs/${runId}/${view}`
      : `/runs/${runId}`;
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export function RunNav({
  runId,
  current,
  query = "",
  className,
}: {
  runId: string;
  current: RunView;
  query?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Run views"
      className={cn(
        "flex flex-wrap gap-x-6 border-b border-line max-[720px]:gap-x-4",
        className,
      )}
    >
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          href={runViewHref(runId, item.key, query)}
          aria-current={item.key === current ? "page" : undefined}
          className="-mb-px inline-flex min-h-10 items-center border-b-2 border-transparent font-medium text-ink-2 no-underline transition-colors duration-hover hover:text-ink aria-[current=page]:border-accent aria-[current=page]:text-ink"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
