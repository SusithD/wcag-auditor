import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-ds="kbd"
      className={cn(
        "inline-block min-w-[18px] rounded-sm border border-b-2 border-line bg-surface px-1 text-center font-sans text-[0.6875rem]/4 font-medium text-ink-3",
        className,
      )}
      {...props}
    />
  );
}
