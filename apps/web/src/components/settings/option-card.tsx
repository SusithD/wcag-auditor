import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
      <label
        className={cn(
          "relative flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-line-control bg-surface p-3 hover:bg-subtle has-[:checked]:border-accent has-[:checked]:bg-tint has-[:checked]:shadow-[0_0_0_1px_var(--accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
          className,
        )}
      >
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
