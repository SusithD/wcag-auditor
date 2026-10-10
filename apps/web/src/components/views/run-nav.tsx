import Link from "next/link";

const ITEMS = [
  { key: "report", label: "Report", suffix: "" },
  { key: "coverage", label: "Coverage", suffix: "/coverage" },
  { key: "compare", label: "Compare", suffix: "/compare" },
] as const;

export function RunNav({
  runId,
  current,
  query = "",
}: {
  runId: string;
  current: (typeof ITEMS)[number]["key"];
  query?: string;
}) {
  return (
    <nav aria-label="Run views" className="flex gap-1">
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          href={`/runs/${runId}${item.suffix}${query}`}
          aria-current={item.key === current ? "page" : undefined}
          className="inline-flex min-h-7 items-center rounded-md px-2.5 text-body hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
