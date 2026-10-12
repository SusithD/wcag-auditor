import { describe, expect, it } from "vitest";
import {
  isPublicPath,
  safeNext,
  stripInternalHeaders,
} from "@/lib/auth/access";

describe("public path allowlist", () => {
  it.each([
    "/login",
    "/reset-password",
    "/api/auth/sign-in/email",
    "/api/auth/get-session",
    "/study",
    "/study/ABC123",
    "/_next/static/chunks/app.js",
    "/favicon.ico",
    "/api/study/materials",
    "/api/study/config",
    "/api/study/sessions",
    "/api/study/sessions/abc/events",
  ])("allows %s without a session", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/audits",
    "/settings",
    "/settings/members",
    "/study/admin",
    "/study/admin/results",
    "/api/runs",
    "/api/study/prepare",
    "/api/study/results",
    "/api/admin/members",
    "/api/authx",
    "/login/other",
  ])("requires a session for %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  it("allows only reads of a run by its 32-hex id", () => {
    const run = `/api/runs/${"a".repeat(32)}/report`;
    expect(isPublicPath(run, "GET")).toBe(true);
    expect(isPublicPath(run, "HEAD")).toBe(true);
    expect(isPublicPath(run, "DELETE")).toBe(false);
    expect(isPublicPath(`/api/runs/${"a".repeat(31)}`, "GET")).toBe(false);
    expect(isPublicPath(`/api/runs/${"g".repeat(32)}`, "GET")).toBe(false);
  });
});

describe("stripInternalHeaders", () => {
  it("removes every x-wcag-* header whatever its case", () => {
    const incoming = new Headers({
      "X-Wcag-User-Email": "admin@lab.test",
      "x-wcag-internal-token": "guess",
      "X-WCAG-Anything": "1",
      "x-forwarded-for": "198.51.100.7",
      accept: "application/json",
    });
    const clean = stripInternalHeaders(incoming);
    expect([...clean.keys()].sort()).toEqual(["accept", "x-forwarded-for"]);
  });
});

describe("safeNext", () => {
  it("keeps same-origin paths and rejects everything else", () => {
    expect(safeNext("/audits?x=1")).toBe("/audits?x=1");
    expect(safeNext("https://evil.test")).toBe("/");
    expect(safeNext("//evil.test")).toBe("/");
    expect(safeNext("/\\evil.test")).toBe("/");
    expect(safeNext("/login?next=/")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});
