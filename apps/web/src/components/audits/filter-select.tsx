import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "relative inline-flex h-8 items-center rounded-md border border-line-control bg-surface text-dense shadow-btn focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        className,
      )}
    >
      <label htmlFor={id} className="pointer-events-none pl-2.5 text-ink-3">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 max-w-44 cursor-pointer appearance-none truncate rounded-md bg-transparent pr-7 pl-1.5 font-medium text-ink outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 size-3.5 text-ink-3"
        aria-hidden="true"
      />
    </div>
  );
}
