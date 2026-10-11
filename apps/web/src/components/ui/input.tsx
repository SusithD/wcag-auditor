import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-[40px] w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-body text-ink transition-colors duration-hover file:inline-flex file:h-[24px] file:border-0 file:bg-transparent file:text-dense file:font-medium file:text-ink placeholder:text-ink-3 focus-visible:border-ring focus-visible:outline-offset-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60 aria-invalid:border-critical",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
