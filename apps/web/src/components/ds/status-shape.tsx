import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ShapeKind =
  | "critical"
  | "serious"
  | "minor"
  | "review"
  | "pass"
  | "undecided"
  | "failed"
  | "running"
  | "done"
  | "alert";

const CUT = "var(--surface, #fff)";

const SHAPES: Record<ShapeKind, ReactNode> = {
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
  pass: (
    <>
      <circle
        cx="6"
        cy="6"
        r="4.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M3.7 6.1l1.6 1.6 3-3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  undecided: (
    <circle
      cx="6"
      cy="6"
      r="4.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="2.2 1.8"
    />
  ),
  failed: (
    <>
      <circle cx="6" cy="6" r="5.4" fill="currentColor" />
      <path
        d="M4 4l4 4M8 4l-4 4"
        stroke={CUT}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  running: (
    <>
      <circle
        cx="6"
        cy="6"
        r="4.6"
        fill="none"
        stroke="var(--track, #e9ebf1)"
        strokeWidth="1.5"
      />
      <path
        d="M6 1.4a4.6 4.6 0 0 1 4.6 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  done: (
    <path
      d="M2.4 6.3l2.4 2.4 4.8-5.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  alert: (
    <>
      <circle cx="6" cy="6" r="5.4" fill="currentColor" />
      <path
        d="M6 3.2v3.4"
        stroke={CUT}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="6" cy="8.6" r=".9" fill={CUT} />
    </>
  ),
};

export const SHAPE_TONE: Record<ShapeKind, string> = {
  critical: "text-critical",
  serious: "text-serious",
  minor: "text-minor",
  review: "text-review",
  pass: "text-ink-2",
  done: "text-ink-2",
  undecided: "text-ink-2",
  failed: "text-critical",
  alert: "text-critical",
  running: "text-accent",
};

export const SHAPE_KINDS = Object.keys(SHAPES) as ShapeKind[];

export function StatusShape({
  kind,
  className,
}: {
  kind: ShapeKind;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      data-shape={kind}
      className={cn("size-3 shrink-0", SHAPE_TONE[kind], className)}
    >
      {SHAPES[kind]}
    </svg>
  );
}
