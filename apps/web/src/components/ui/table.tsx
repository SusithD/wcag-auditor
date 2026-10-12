"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Table({
  className,
  regionLabel,
  ...props
}: React.ComponentProps<"table"> & { regionLabel?: string }) {
  const container = React.useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = React.useState(false);

  React.useEffect(() => {
    const el = container.current;
    if (!el || !regionLabel) return;
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [regionLabel]);

  return (
    <div
      ref={container}
      data-slot="table-container"
      className="relative w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
      {...(scrolls
        ? { role: "region", "aria-label": regionLabel, tabIndex: 0 }
        : {})}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-dense", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:h-[36px] [&_tr]:border-b [&_tr]:border-line [&_tr]:hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-subtle font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "h-[48px] border-b border-line transition-colors duration-hover hover:bg-subtle has-aria-expanded:bg-subtle data-[state=selected]:bg-tint",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-[36px] px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-ink-3 first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2 align-middle whitespace-nowrap first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-dense text-ink-3", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
