import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type ShapeKind, StatusShape } from "./status-shape";

export function Status({
  kind,
  children,
  strong = false,
  zero = false,
  className,
}: {
  kind: ShapeKind;
  children: ReactNode;
  strong?: boolean;
  zero?: boolean;
  className?: string;
}) {
  return (
    <span
      data-ds="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-dense whitespace-nowrap",
        strong ? "font-medium text-ink" : "text-ink-2",
        zero && "text-ink-3",
        className,
      )}
    >
      <StatusShape kind={kind} className={zero ? "opacity-45" : undefined} />
      {children}
    </span>
  );
}
