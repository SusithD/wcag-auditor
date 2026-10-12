export type UrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const BAD = "Enter a full address such as https://example.com";
const HOST =
  /^(localhost|\[[0-9a-f:.]+\]|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/i;

export function normalizeUrl(raw: string): UrlResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Enter a web address" };
  if (/\s/.test(text)) return { ok: false, error: BAD };
  const withScheme = text.includes("://") ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: BAD };
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !HOST.test(parsed.hostname) ||
    parsed.port === "0"
  ) {
    return { ok: false, error: BAD };
  }
  return { ok: true, url: withScheme };
}

export function middleTruncate(text: string, max = 44): string {
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`;
}

const HAS_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

export function parseTimestamp(iso: string): number {
  const text = iso.trim();
  const zoned =
    text.includes("T") && !HAS_OFFSET.test(text) ? `${text}Z` : text;
  return new Date(zoned).getTime();
}

export function age(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - parseTimestamp(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

const ERROR_PATTERNS: [RegExp, string][] = [
  [
    /^The site showed a bot check/i,
    "The site showed a bot check instead of the page, so the audit was stopped. Audit a page without bot protection, or upload screenshots instead.",
  ],
  [
    /ERR_INVALID_URL|invalid url|cannot navigate to invalid|ERR_UNKNOWN_URL_SCHEME|protocol error.*url/i,
    "That address is not valid. Enter a full address such as https://example.com.",
  ],
  [
    /ERR_CERT|ERR_SSL|certificate/i,
    "The site's security certificate could not be verified, so the page could not be opened.",
  ],
  [
    /timeout|timed out|ERR_TIMED_OUT/i,
    "The page took too long to load. Try again, or check that the site is up.",
  ],
  [
    /ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo|ERR_CONNECTION|ECONNREFUSED|ERR_ADDRESS|ERR_INTERNET_DISCONNECTED|net::ERR|dns/i,
    "The tool could not reach that address. Check it and try again.",
  ],
];

export function describeRunError(raw: string | null | undefined): string {
  const text = raw ?? "";
  for (const [pattern, message] of ERROR_PATTERNS) {
    if (pattern.test(text)) return message;
  }
  return "The audit stopped before it finished. Try again, or start a new audit.";
}

export function isBotCheckError(raw: string | null | undefined): boolean {
  return /^The site showed a bot check/i.test(raw ?? "");
}
