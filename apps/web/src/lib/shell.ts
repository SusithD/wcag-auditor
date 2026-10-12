export type Crumb = { label: string; href?: string };

export type NavEntry = {
  key: string;
  label: string;
  href: string;
  match: (pathname: string) => boolean;
};

const exact = (href: string) => (p: string) => p === href;
const under = (href: string) => (p: string) =>
  p === href || p.startsWith(`${href}/`);

export const PRIMARY_NAV: NavEntry[] = [
  { key: "overview", label: "Overview", href: "/", match: exact("/") },
  {
    key: "audits",
    label: "Audits",
    href: "/audits",
    match: (p) => under("/audits")(p) || under("/runs")(p),
  },
  {
    key: "review",
    label: "Review queue",
    href: "/review",
    match: under("/review"),
  },
  { key: "sites", label: "Sites", href: "/sites", match: under("/sites") },
];

export const RESEARCH_NAV: NavEntry[] = [
  { key: "eval", label: "Evaluation", href: "/eval", match: under("/eval") },
  {
    key: "study",
    label: "Study",
    href: "/study/admin",
    match: under("/study/admin"),
  },
];

export const FOOTER_NAV: NavEntry[] = [
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    match: under("/settings"),
  },
  {
    key: "help",
    label: "Help and method",
    href: "/help",
    match: under("/help"),
  },
];

export function isParticipantRoute(pathname: string): boolean {
  if (pathname === "/study") return true;
  if (!pathname.startsWith("/study/")) return false;
  return !(pathname === "/study/admin" || pathname.startsWith("/study/admin/"));
}

export function defaultCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "Overview" }];
  const [first, second, third] = segments;
  switch (first) {
    case "audits":
      return [{ label: "Audits" }];
    case "audit":
      return [{ label: "Audits", href: "/audits" }, { label: "New audit" }];
    case "review":
      return [{ label: "Review queue" }];
    case "sites":
      return [{ label: "Sites" }];
    case "eval":
      return [{ label: "Research" }, { label: "Evaluation" }];
    case "study":
      return [{ label: "Research" }, { label: "Study" }];
    case "settings":
      return [{ label: "Settings" }];
    case "help":
      return [{ label: "Help and method" }];
    case "runs": {
      const base: Crumb = { label: "Audits", href: "/audits" };
      if (!second) return [{ label: "Audits" }];
      if (!third) return [base, { label: "Audit report" }];
      return [
        base,
        { label: "Audit report", href: `/runs/${second}` },
        { label: third === "coverage" ? "Coverage" : "Compare" },
      ];
    }
    default:
      return [];
  }
}

export function hostOf(source: string): string | null {
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type RecentSite = { host: string; runId: string };

export const UPLOAD_LABEL = "Uploaded screenshots";

export function isUploadId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}

export function uploadLabel(createdAt?: string | null): string {
  const date = createdAt ? new Date(createdAt) : null;
  if (!date || Number.isNaN(date.getTime())) return UPLOAD_LABEL;
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${UPLOAD_LABEL}, ${day}`;
}

export function recentSites(
  runs: {
    id: string;
    source_kind: string;
    source: string;
    created_at?: string;
  }[],
  limit = 3,
): RecentSite[] {
  const seen = new Set<string>();
  const out: RecentSite[] = [];
  for (const run of runs) {
    let host: string | null = null;
    if (run.source_kind === "url") host = hostOf(run.source);
    else if (run.source_kind === "folder")
      host = run.source.split("/").filter(Boolean).slice(-1)[0] ?? null;
    else host = uploadLabel(run.created_at);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push({ host, runId: run.id });
    if (out.length === limit) break;
  }
  return out;
}

export function runLabel(run: {
  source_kind: string;
  source: string;
  created_at?: string;
}): string {
  if (run.source_kind === "url") return run.source.replace(/^https?:\/\//, "");
  if (run.source_kind === "folder")
    return run.source.split("/").filter(Boolean).slice(-1)[0] ?? run.source;
  return uploadLabel(run.created_at);
}

export type PaletteItem = {
  id: string;
  group: string;
  label: string;
  hint?: string;
};

export function filterPalette<T extends PaletteItem>(
  items: T[],
  query: string,
): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;
  return items.filter((item) => {
    const haystack =
      `${item.group} ${item.label} ${item.hint ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function stepIndex(current: number, delta: number, length: number) {
  if (length === 0) return 0;
  return (current + delta + length) % length;
}
