import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { splitSc } from "./helpers";

export function ScCode({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const parts = splitSc(code);
  return (
    <span
      data-ds="sc"
      className={cn(
        "font-mono text-[0.78rem] font-medium whitespace-nowrap text-ink-3",
        className,
      )}
    >
      {parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional code segments
        <Fragment key={index}>
          {index > 0 ? (
            <span className="-mx-[0.18em] opacity-55">.</span>
          ) : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
