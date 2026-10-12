import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusShape } from "./status-shape";

export type TagTone = "neutral" | "critical" | "serious" | "minor" | "review";

const TONE: Record<TagTone, string> = {
  neutral: "border-line bg-surface text-ink-2",
  critical: "border-transparent bg-critical-bg text-critical",
  serious: "border-transparent bg-serious-bg text-serious",
  minor: "border-transparent bg-minor-bg text-minor",
  review: "border-transparent bg-review-bg text-review",
};

export function Tag({
  tone = "neutral",
  children,
  className,
}: {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-ds="tag"
      data-tone={tone}
      className={cn(
        "inline-flex min-h-[22px] w-fit items-center gap-1.5 rounded-sm border px-2 text-xs font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {tone === "neutral" ? null : (
        <StatusShape kind={tone} className="size-[11px] text-current" />
      )}
      {children}
    </span>
  );
}
