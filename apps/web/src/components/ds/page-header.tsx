import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  scope,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  scope?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="t-page text-ink">{title}</h1>
        {description ? <p className="mt-1 text-ink-2">{description}</p> : null}
      </div>
      {scope || actions ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {scope ? <p className="text-dense text-ink-3">{scope}</p> : null}
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
