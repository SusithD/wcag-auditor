import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/[...path]/route";

describe("api proxy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards X-Forwarded-For and drops cookies", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://web/api/study/config", {
      headers: {
        "x-forwarded-for": "198.51.100.7",
        cookie: "session=secret",
      },
    });
    await GET(request, {
      params: Promise.resolve({ path: ["study", "config"] }),
    });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0];
    expect(url).toMatch(/\/study\/config$/);
    const headers = init.headers as Headers;
    expect(headers.get("x-forwarded-for")).toBe("198.51.100.7");
    expect(headers.get("cookie")).toBeNull();
  });
});
