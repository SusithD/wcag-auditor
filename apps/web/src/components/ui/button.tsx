import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-dense/none font-medium whitespace-nowrap transition-colors duration-hover select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-critical [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-line-control bg-surface text-ink shadow-btn hover:bg-subtle aria-expanded:bg-subtle",
        outline:
          "border-line-control bg-surface text-ink shadow-btn hover:bg-subtle aria-expanded:bg-subtle",
        secondary:
          "border-line-control bg-surface text-ink shadow-btn hover:bg-subtle aria-expanded:bg-subtle",
        primary:
          "border-accent-fill bg-accent-fill text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:border-accent-fill-hover hover:bg-accent-fill-hover",
        ghost:
          "bg-transparent text-ink-2 hover:bg-subtle hover:text-ink aria-expanded:bg-subtle aria-expanded:text-ink",
        destructive:
          "border-line-control bg-surface text-critical shadow-btn hover:bg-critical-bg",
        link: "text-accent underline underline-offset-3 hover:text-ink",
      },
      size: {
        default: "h-[32px] px-3",
        xs: "h-[24px] gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[28px] px-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[40px] px-4 text-body/none",
        icon: "size-[32px] p-0",
        "icon-xs": "size-[24px] p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[28px] p-0",
        "icon-lg": "size-[40px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
