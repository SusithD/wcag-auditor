import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
  isPublicPath,
  PATHNAME_HEADER,
  stripInternalHeaders,
} from "@/lib/auth/access";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const headers = stripInternalHeaders(request.headers);
  headers.set(PATHNAME_HEADER, pathname);

  if (
    isPublicPath(pathname, request.method) ||
    getSessionCookie(request) !== null
  ) {
    return NextResponse.next({ request: { headers } });
  }
  if (pathname.startsWith("/api/")) {
    return Response.json({ detail: "Sign in required" }, { status: 401 });
  }
  const target = new URL("/login", request.url);
  target.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
