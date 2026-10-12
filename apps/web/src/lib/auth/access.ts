const PARTICIPANT_API = /^\/api\/study\/(materials|config|sessions)(\/[^/]+)*$/;
const PARTICIPANT_RUN = /^\/api\/runs\/[0-9a-f]{32}(\/.*)?$/;
const PUBLIC_PAGES = new Set(["/login", "/reset-password", "/favicon.ico"]);

export const INTERNAL_HEADER_PREFIX = "x-wcag-";
export const USER_EMAIL_HEADER = "X-Wcag-User-Email";
export const USER_NAME_HEADER = "X-Wcag-User-Name";
export const INTERNAL_TOKEN_HEADER = "X-Wcag-Internal-Token";
export const PATHNAME_HEADER = "x-wcag-pathname";

function isStudyParticipantPage(pathname: string): boolean {
  if (pathname === "/study") return true;
  if (!pathname.startsWith("/study/")) return false;
  return !(pathname === "/study/admin" || pathname.startsWith("/study/admin/"));
}

export function isParticipantApi(pathname: string, method = "GET"): boolean {
  if (PARTICIPANT_API.test(pathname)) return true;
  const read = method === "GET" || method === "HEAD";
  return read && PARTICIPANT_RUN.test(pathname);
}

export function isPublicPath(pathname: string, method = "GET"): boolean {
  if (PUBLIC_PAGES.has(pathname)) return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/"))
    return true;
  if (pathname.startsWith("/_next/")) return true;
  if (isStudyParticipantPage(pathname)) return true;
  return isParticipantApi(pathname, method);
}

export function stripInternalHeaders(source: Headers): Headers {
  const out = new Headers();
  source.forEach((value, key) => {
    if (!key.toLowerCase().startsWith(INTERNAL_HEADER_PREFIX))
      out.set(key, value);
  });
  return out;
}

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.startsWith("/\\") || next.startsWith("/login")) return "/";
  return next;
}
