import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function QuietLink({
  className,
  children,
  arrow = true,
  ...props
}: ComponentProps<typeof Link> & { arrow?: boolean }) {
  return (
    <Link
      data-ds="quiet-link"
      className={cn(
        "-mr-2 inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-dense font-medium text-ink-2 no-underline transition-colors duration-hover hover:bg-subtle hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
      {arrow ? <ArrowRight className="size-3.5" aria-hidden="true" /> : null}
    </Link>
  );
}
