import { runLabel } from "@/lib/shell";

export type SiteFilter = "all" | "failures" | "running";

export type SiteLike = {
  failures: number;
  latest_run: { status: string };
};

export function isActive(status: string): boolean {
  return status === "queued" || status === "running";
}

export function filterSites<T extends SiteLike>(
  rows: T[],
  filter: SiteFilter,
): T[] {
  if (filter === "failures") return rows.filter((row) => row.failures > 0);
  if (filter === "running")
    return rows.filter((row) => isActive(row.latest_run.status));
  return rows;
}

export function siteParts(run: {
  source_kind: string;
  source: string;
  created_at?: string;
}): {
  host: string;
  path: string;
} {
  if (run.source_kind === "url") {
    try {
      const url = new URL(run.source);
      const path = url.pathname.replace(/\/$/, "") + url.search;
      return { host: url.hostname.replace(/^www\./, ""), path: path || "/" };
    } catch {
      return { host: run.source, path: "" };
    }
  }
  return { host: runLabel(run), path: "" };
}

export function changeText(delta: number | null, hasPrevious: boolean): string {
  if (!hasPrevious || delta === null) return "First audit of this site";
  if (delta === 0) return "No change since last audit";
  const n = Math.abs(delta);
  return `${n} ${delta < 0 ? "fewer" : "more"} since last audit`;
}

export function reasonLabel(reason: string | null): string {
  if (!reason) return "No reason recorded";
  const head = reason
    .split(":")[0]
    .replace(/\s*\([A-Z]\d\)\s*$/, "")
    .trim();
  return head.charAt(0).toUpperCase() + head.slice(1);
}

export function failureShort(error: string | null): string {
  const text = error ?? "";
  if (/timeout|timed out/i.test(text)) return "timed out";
  if (/ERR_CERT|ERR_SSL|certificate/i.test(text)) return "certificate problem";
  if (
    /ERR_NAME|ENOTFOUND|getaddrinfo|ERR_CONNECTION|ECONNREFUSED|net::ERR/i.test(
      text,
    )
  )
    return "address not reachable";
  return "audit stopped";
}

export type RunStatusView = {
  kind: "running" | "done" | "failed" | "alert";
  label: string;
};

export function runStatusView(
  status: string,
  error: string | null,
): RunStatusView {
  switch (status) {
    case "done":
      return { kind: "done", label: "Complete" };
    case "partial":
      return { kind: "alert", label: "Partly complete" };
    case "queued":
      return { kind: "running", label: "Queued" };
    case "running":
      return { kind: "running", label: "Running" };
    case "cancelled":
      return { kind: "failed", label: "Cancelled" };
    default:
      return { kind: "failed", label: `Audit failed: ${failureShort(error)}` };
  }
}

export function overviewSentence(running: number, waiting: number): string {
  const audits =
    running === 0
      ? "No audit is running"
      : running === 1
        ? "One audit is running"
        : `${running} audits are running`;
  const findings =
    waiting === 0
      ? "no findings are waiting for review"
      : waiting === 1
        ? "1 finding is waiting for review"
        : `${waiting} findings are waiting for review`;
  return `${audits} and ${findings}.`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function weekRange(now: Date = new Date()): string {
  const day = (now.getUTCDay() + 6) % 7;
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day),
  );
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const month = (d: Date) => MONTHS[d.getUTCMonth()];
  const first =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${start.getUTCDate()}`
      : `${start.getUTCDate()} ${month(start)}`;
  return `${first} to ${end.getUTCDate()} ${month(end)}`;
}

export function weekComparison(thisWeek: number, lastWeek: number): string {
  const diff = thisWeek - lastWeek;
  if (diff === 0) return "Same as last week";
  return `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than last week`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function viewportWords(viewports: string[]): string {
  return viewports
    .map((v) => (v === "desktop" ? "Desktop" : "Mobile"))
    .join(" and ");
}
