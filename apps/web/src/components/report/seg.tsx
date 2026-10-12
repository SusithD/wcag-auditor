import { cn } from "@/lib/utils";

export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
  small = false,
  className,
}: {
  label: string;
  value: T;
  options: {
    value: T;
    label: React.ReactNode;
    name?: string;
    disabled?: boolean;
  }[];
  onChange: (value: T) => void;
  small?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex gap-0.5 rounded-md bg-subtle p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            aria-label={o.name}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-w-[24px] items-center disabled:opacity-50 gap-1.5 rounded-[4px] border-0 px-2.5 text-dense font-medium text-ink-2 transition-colors duration-hover hover:text-ink [&_svg]:size-3.5",
              small ? "min-h-[24px] px-2 text-xs" : "min-h-[28px]",
              on &&
                "bg-surface font-semibold text-ink shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_55/0.08)] forced-colors:outline-2 forced-colors:outline-[Highlight]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
