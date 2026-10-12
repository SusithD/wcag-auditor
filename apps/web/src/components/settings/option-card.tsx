import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const OPTION_CARD =
  "relative flex min-h-16 cursor-pointer items-start gap-3 rounded-md border border-line-control bg-surface px-4 py-3 hover:bg-subtle has-[:checked]:border-accent has-[:checked]:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

export function OptionGroup({
  legend,
  children,
  className,
  radio = false,
}: {
  legend: ReactNode;
  children: ReactNode;
  className?: string;
  radio?: boolean;
}) {
  return (
    <fieldset
      role={radio ? "radiogroup" : undefined}
      className={cn("m-0 grid min-w-0 gap-2 border-0 p-0", className)}
    >
      <legend className="t-section mb-2 p-0 text-ink">{legend}</legend>
      {children}
    </fieldset>
  );
}

export function OptionCard({
  type = "radio",
  name,
  value,
  checked,
  onChange,
  title,
  description,
  hint,
  children,
  inputRef,
  className,
}: {
  type?: "radio" | "checkbox";
  name: string;
  value?: string;
  checked: boolean;
  onChange: () => void;
  title: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  inputRef?: (el: HTMLInputElement | null) => void;
  className?: string;
}) {
  return (
    <div>
      <label className={cn(OPTION_CARD, className)}>
        <input
          ref={inputRef}
          type={type}
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          className={cn(
            "mt-0.5 size-4 shrink-0 outline-none",
            type === "radio"
              ? "appearance-none rounded-full border border-line-strong bg-surface checked:border-[5px] checked:border-accent-fill"
              : "accent-accent-fill",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{title}</span>
          {description ? (
            <span className="block text-dense text-ink-3">{description}</span>
          ) : null}
        </span>
        {hint ? <span className="self-center">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

export function SegmentedRadio({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: { value: string; label: ReactNode }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex w-fit gap-0.5 rounded-md bg-subtle p-0.5">
      {options.map((o) => (
        <label
          key={o.value}
          className="relative inline-flex min-h-[28px] cursor-pointer items-center rounded-[4px] px-3 text-dense font-medium text-ink-2 transition-colors duration-hover hover:text-ink has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-ink has-[:checked]:shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_55/0.08)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
