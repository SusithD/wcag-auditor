import { describe, expect, it } from "vitest";
import {
  age,
  describeRunError,
  middleTruncate,
  normalizeUrl,
  parseTimestamp,
} from "@/lib/url";

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
    "not a url ///",
    "foo",
    "https://foo",
    "a..b",
    "https://exa%20mple.com",
  ])("rejects %j", (raw) => {
    expect(normalizeUrl(raw).ok).toBe(false);
  });

  it("uses the full-address hint for malformed input", () => {
    expect(normalizeUrl("not a url ///")).toEqual({
      ok: false,
      error: "Enter a full address such as https://example.com",
    });
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

  it("reads a timestamp without an offset as UTC, whatever the machine timezone", () => {
    const naive = "2026-10-10T11:59:40";
    expect(parseTimestamp(naive)).toBe(Date.UTC(2026, 9, 10, 11, 59, 40));
    expect(age(naive, now)).toBe("just now");
    expect(age("2026-10-10T09:00:00.123456", now)).toBe("3 h ago");
  });

  it("keeps explicit offsets", () => {
    expect(parseTimestamp("2026-10-10T17:30:00+05:30")).toBe(
      Date.UTC(2026, 9, 10, 12, 0, 0),
    );
    expect(parseTimestamp("2026-10-10T12:00:00Z")).toBe(
      Date.UTC(2026, 9, 10, 12, 0, 0),
    );
    expect(parseTimestamp("2026-10-10T07:00:00-05:00")).toBe(
      Date.UTC(2026, 9, 10, 12, 0, 0),
    );
  });
});

describe("describeRunError", () => {
  it.each([
    [
      "Page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.invalid/",
      "The tool could not reach that address. Check it and try again.",
    ],
    [
      "Page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:1/",
      "The tool could not reach that address. Check it and try again.",
    ],
    [
      "Page.goto: Timeout 30000ms exceeded.",
      "The page took too long to load. Try again, or check that the site is up.",
    ],
    [
      "Page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL",
      "That address is not valid. Enter a full address such as https://example.com.",
    ],
    [
      "Page.goto: net::ERR_CERT_AUTHORITY_INVALID",
      "The site's security certificate could not be verified, so the page could not be opened.",
    ],
  ])("maps %j", (raw, expected) => {
    expect(describeRunError(raw)).toBe(expected);
  });

  it("falls back to a plain sentence without raw text", () => {
    expect(describeRunError("KeyError: 'foo'")).toMatch(/stopped before/);
    expect(describeRunError(null)).toMatch(/stopped before/);
  });
});
