import type { components } from "@/api/types";

export type ReviewItem = components["schemas"]["ReviewItem"];
export type Choice = "confirmed" | "dismissed" | "unsure";
export type QueueState = "waiting" | "decided" | "all";

export { DISMISS_REASONS } from "@/lib/dismiss-reasons";

export const CRITERIA_OPTIONS = [
  { value: "1.4.3", label: "1.4.3 Contrast (Minimum)" },
  { value: "1.4.11", label: "1.4.11 Non-text Contrast" },
  { value: "2.4.7", label: "2.4.7 Focus Visible" },
  { value: "2.4.11", label: "2.4.11 Focus Not Obscured (Minimum)" },
  { value: "2.4.12", label: "2.4.12 Focus Not Obscured (Enhanced)" },
  { value: "2.4.13", label: "2.4.13 Focus Appearance" },
  { value: "2.5.7", label: "2.5.7 Dragging Movements" },
  { value: "2.5.8", label: "2.5.8 Target Size (Minimum)" },
];

export function decisionOf(finding: ReviewItem["finding"]) {
  return (
    finding.decision ?? {
      status: "open" as const,
      reason: null,
      note: null,
      decided_at: null,
      decided_by: null,
    }
  );
}

export const NO_REASON = "No reason recorded";

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function reasonTitle(reason: string | null | undefined): string {
  if (!reason) return NO_REASON;
  const head = reason
    .split(":")[0]
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  return capitalise(head);
}

export function reasonSentence(reason: string | null | undefined): string {
  if (!reason) return "The tool did not record why this needs a person.";
  const text = reason
    .replace(/\s*\(([A-Z]\d+)\)\s*$/, "")
    .replace(/:\s+(\w)/, (_, c: string) => `. ${c.toUpperCase()}`)
    .trim();
  const sentence = capitalise(text);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export type Group = { key: string; title: string; items: ReviewItem[] };

export function groupByReason(
  items: ReviewItem[],
  order: { reason: string | null }[],
): Group[] {
  const groups = new Map<string, Group>();
  for (const entry of order) {
    const key = entry.reason ?? "";
    groups.set(key, { key, title: reasonTitle(entry.reason), items: [] });
  }
  for (const item of items) {
    const key = item.finding.needs_review_reason ?? "";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: reasonTitle(item.finding.needs_review_reason),
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].filter((g) => g.items.length > 0);
}

export function nextIndex(
  length: number,
  current: number,
  delta: 1 | -1,
): number {
  if (length === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, current + delta));
}

export function choiceOf(status: string): Choice | null {
  if (status === "confirmed" || status === "dismissed" || status === "unsure")
    return status;
  return null;
}

export function choiceWord(status: string): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "dismissed":
      return "Dismissed";
    case "unsure":
      return "Could not decide";
    default:
      return "Waiting";
  }
}

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "number",
  "password",
  "tel",
]);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target instanceof HTMLInputElement)
    return TEXT_INPUT_TYPES.has(target.type);
  return false;
}

export function formatDecided(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(
    iso.includes("T") && !/Z|[+-]\d\d:?\d\d$/.test(iso) ? `${iso}Z` : iso,
  );
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} ${time}`;
}
