"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1.5 rounded-md border border-transparent text-dense/none font-medium whitespace-nowrap transition-colors duration-hover disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-critical [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-ink-2 hover:bg-subtle hover:text-ink aria-pressed:bg-subtle aria-pressed:font-semibold aria-pressed:text-ink data-[pressed]:bg-subtle data-[pressed]:font-semibold data-[pressed]:text-ink",
        outline:
          "border-line-control bg-surface text-ink-2 shadow-btn hover:bg-subtle hover:text-ink aria-pressed:border-ring aria-pressed:bg-tint aria-pressed:font-semibold aria-pressed:text-ink data-[pressed]:border-ring data-[pressed]:bg-tint data-[pressed]:font-semibold data-[pressed]:text-ink",
        seg: "rounded-sm bg-transparent text-ink-2 hover:text-ink aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-ink aria-pressed:shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_55/0.08)] data-[pressed]:bg-surface data-[pressed]:font-semibold data-[pressed]:text-ink data-[pressed]:shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_55/0.08)]",
      },
      size: {
        default: "h-[32px] min-w-[32px] px-3",
        sm: "h-[28px] min-w-[28px] px-2.5",
        lg: "h-[40px] min-w-[40px] px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
