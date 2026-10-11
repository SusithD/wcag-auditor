"use client";

import { ChevronDown } from "lucide-react";
import { ScCode } from "@/components/ds";
import { siteLabel } from "@/components/sites/site-label";
import { Button } from "@/components/ui/button";
import { age } from "@/lib/url";
import { cn } from "@/lib/utils";
import { choiceWord, DISMISS_REASONS, type Group } from "./review-model";

export function ReviewList({
  groups,
  openKeys,
  onToggleGroup,
  selectedId,
  onSelect,
  checked,
  onCheck,
  onCheckGroup,
  compact,
  bulkReasonOpen,
  onBulkConfirm,
  onBulkDismissStart,
  onBulkDismiss,
  onClear,
  busy,
}: {
  groups: Group[];
  openKeys: Set<string>;
  onToggleGroup: (key: string) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  checked: Set<number>;
  onCheck: (id: number) => void;
  onCheckGroup: (group: Group) => void;
  compact: boolean;
  bulkReasonOpen: boolean;
  onBulkConfirm: () => void;
  onBulkDismissStart: () => void;
  onBulkDismiss: (reason: string) => void;
  onClear: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col border-line max-[900px]:max-h-[480px] max-[900px]:border-b min-[901px]:border-r">
      <div
        role="region"
        aria-label="Findings, grouped by reason"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto"
      >
        {groups.map((group, gi) => {
          const open = openKeys.has(group.key);
          const headId = `grp-${gi}`;
          return (
            <section
              key={group.key}
              aria-labelledby={headId}
              className="border-b border-line last:border-b-0"
            >
              <div
                className={cn(
                  "sticky top-0 z-[1] flex min-h-10 items-center gap-2 bg-subtle px-4",
                  open && "border-b border-line",
                )}
              >
                <h2
                  id={headId}
                  className="m-0 min-w-0 flex-1 text-dense font-semibold text-ink"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`${headId}-items`}
                    onClick={() => onToggleGroup(group.key)}
                    className="-ml-2 flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left font-semibold hover:bg-line/40"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-ink-3",
                        !open && "-rotate-90",
                      )}
                      aria-hidden="true"
                    />
                    <span>
                      {group.title}
                      <span className="num ml-1 font-medium text-ink-3">
                        {group.items.length}
                      </span>
                    </span>
                  </button>
                </h2>
                <button
                  type="button"
                  onClick={() => onCheckGroup(group)}
                  aria-label={`Select all in group ${group.title}`}
                  className="min-h-6 shrink-0 rounded-md px-2 text-dense text-ink-2 hover:bg-line/40 hover:text-ink"
                >
                  Select all in group
                </button>
              </div>
              {open ? (
                <ul id={`${headId}-items`} className="m-0 list-none p-0">
                  {group.items.map((item) => {
                    const f = item.finding;
                    const on = f.id === selectedId;
                    const label = f.guidance?.sc_title ?? "Finding";
                    return (
                      <li
                        key={f.id}
                        className="border-b border-line last:border-b-0"
                      >
                        <div
                          data-finding-id={f.id}
                          className={cn(
                            "relative flex items-start gap-3 px-4 hover:bg-subtle",
                            compact ? "py-2" : "py-3",
                            on &&
                              "bg-tint before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked.has(f.id)}
                            onChange={() => onCheck(f.id)}
                            aria-label={`Select ${f.sc} ${label}, ${siteLabel(item.site)}`}
                            className="mt-0.5 size-4 shrink-0 accent-accent-fill"
                          />
                          <button
                            type="button"
                            aria-current={on ? "true" : undefined}
                            onClick={() => onSelect(f.id)}
                            className="flex min-h-8 min-w-0 flex-1 flex-col gap-0.5 rounded-md text-left outline-offset-2"
                          >
                            <span className="flex items-baseline gap-2">
                              <ScCode code={f.sc} />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate font-medium text-ink",
                                  on && "font-semibold",
                                )}
                              >
                                {label}
                              </span>
                              <span className="num shrink-0 pl-2 text-xs text-ink-3">
                                {age(item.created_at)}
                              </span>
                            </span>
                            <span className="truncate text-dense text-ink-3">
                              {siteLabel(item.site)}
                              {f.status !== "open" ? (
                                <span> - {choiceWord(f.status)}</span>
                              ) : null}
                            </span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
      {checked.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex flex-none flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3"
        >
          <b className="num mr-auto font-semibold">{checked.size} selected</b>
          <Button size="sm" onClick={onBulkConfirm} disabled={busy}>
            Confirm
          </Button>
          <Button
            size="sm"
            aria-expanded={bulkReasonOpen}
            onClick={onBulkDismissStart}
            disabled={busy}
          >
            Not an issue…
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
          {bulkReasonOpen ? (
            <div
              role="group"
              aria-label="Reason for not an issue"
              className="flex w-full flex-wrap items-center gap-2"
            >
              <span className="text-xs font-medium text-ink-3">Reason</span>
              {DISMISS_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={busy}
                  onClick={() => onBulkDismiss(reason)}
                  className="inline-flex min-h-7 items-center rounded-full border border-line-control bg-surface px-3 text-dense font-medium text-ink-2 hover:bg-subtle"
                >
                  {reason}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
