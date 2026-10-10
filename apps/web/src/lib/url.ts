export type UrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const BAD = "Enter a web address that starts with http:// or https://";

export function normalizeUrl(raw: string): UrlResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Enter a web address" };
  const withScheme = text.includes("://") ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: BAD };
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
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

export function age(iso: string, now = Date.now()): string {
  const seconds = Math.max(
    0,
    Math.round((now - new Date(iso).getTime()) / 1000),
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
