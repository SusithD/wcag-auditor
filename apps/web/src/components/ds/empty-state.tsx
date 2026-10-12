import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  children,
  action,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return (
    <div
      data-ds="empty-state"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-12 text-center",
        className,
      )}
    >
      <Heading className="t-section text-ink">{title}</Heading>
      {children ? <p className="text-ink-2">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
