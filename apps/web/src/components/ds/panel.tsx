import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  as: Tag = "section",
  className,
  ...props
}: ComponentProps<"section"> & { as?: ElementType }) {
  return (
    <Tag
      data-ds="panel"
      className={cn(
        "min-w-0 rounded-lg border border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  right,
  id,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  id?: string;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 border-b border-line px-4",
        className,
      )}
    >
      <Heading id={id} className="t-section text-ink">
        {title}
      </Heading>
      {right ? (
        <div className="flex items-center gap-2 text-dense text-ink-3">
          {right}
        </div>
      ) : null}
    </div>
  );
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}
