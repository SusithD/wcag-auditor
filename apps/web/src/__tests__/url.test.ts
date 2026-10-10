import { describe, expect, it } from "vitest";
import { age, middleTruncate, normalizeUrl } from "@/lib/url";

describe("normalizeUrl", () => {
  it.each([
    ["example.com", "https://example.com"],
    ["  http://example.com/a?b=1 ", "http://example.com/a?b=1"],
    ["https://example.com", "https://example.com"],
    ["localhost:3000/path", "https://localhost:3000/path"],
  ])("accepts %s", (raw, expected) => {
    expect(normalizeUrl(raw)).toEqual({ ok: true, url: expected });
  });

  it.each([
    "",
    "   ",
    "ftp://example.com",
    "https://",
    "javascript:alert(1)",
    "http://a b.com",
  ])("rejects %j", (raw) => {
    expect(normalizeUrl(raw).ok).toBe(false);
  });

  it("explains an empty field differently from a bad scheme", () => {
    expect(normalizeUrl("")).toEqual({
      ok: false,
      error: "Enter a web address",
    });
    expect(normalizeUrl("ftp://x.com")).toMatchObject({
      ok: false,
      error: expect.stringContaining("http"),
    });
  });
});

describe("middleTruncate", () => {
  it("keeps short text and shortens long text in the middle", () => {
    expect(middleTruncate("short.com", 44)).toBe("short.com");
    const out = middleTruncate(
      "https://example.com/a/very/long/path/that/keeps/going/and/going.html",
      30,
    );
    expect(out).toHaveLength(30);
    expect(out.startsWith("https://exa")).toBe(true);
    expect(out.endsWith("going.html")).toBe(true);
    expect(out).toContain("…");
  });
});

describe("age", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it.each([
    ["2026-10-10T11:59:40Z", "just now"],
    ["2026-10-10T11:30:00Z", "30 min ago"],
    ["2026-10-10T09:00:00Z", "3 h ago"],
    ["2026-10-08T12:00:00Z", "2 d ago"],
  ])("%s -> %s", (iso, text) => {
    expect(age(iso, now)).toBe(text);
  });
});
