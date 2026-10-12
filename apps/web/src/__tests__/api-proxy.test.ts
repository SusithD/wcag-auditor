import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/[...path]/route";

const getSessionUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSessionUser }));

const SESSION_COOKIE = "better-auth.session_token=abc.def";

type FetchCall = [string, RequestInit];

function stubUpstream() {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentHeaders(fetchMock: ReturnType<typeof stubUpstream>): Headers {
  const calls = fetchMock.mock.calls as unknown as FetchCall[];
  return calls[0][1].headers as Headers;
}

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe("api proxy", () => {
  beforeEach(() => {
    getSessionUser.mockReset();
    vi.stubEnv("INTERNAL_API_TOKEN", "internal-secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards X-Forwarded-For and drops cookies on participant calls", async () => {
    const fetchMock = stubUpstream();
    await GET(
      new Request("http://web/api/study/config", {
        headers: { "x-forwarded-for": "198.51.100.7", cookie: "session=s" },
      }),
      ctx("study", "config"),
    );
    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    expect(calls[0][0]).toMatch(/\/study\/config$/);
    const headers = sentHeaders(fetchMock);
    expect(headers.get("x-forwarded-for")).toBe("198.51.100.7");
    expect(headers.get("cookie")).toBeNull();
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("strips spoofed x-wcag headers from anonymous participant calls", async () => {
    const fetchMock = stubUpstream();
    await GET(
      new Request("http://web/api/study/config", {
        headers: {
          "X-Wcag-User-Email": "admin@lab.test",
          "X-Wcag-Internal-Token": "guess",
        },
      }),
      ctx("study", "config"),
    );
    const headers = sentHeaders(fetchMock);
    expect(headers.get("x-wcag-user-email")).toBeNull();
    expect(headers.get("x-wcag-internal-token")).toBeNull();
  });

  it("answers 401 for non-participant calls without a session", async () => {
    const fetchMock = stubUpstream();
    const response = await GET(new Request("http://web/api/runs"), ctx("runs"));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 401 when the session cookie is present but invalid", async () => {
    getSessionUser.mockResolvedValue(null);
    const fetchMock = stubUpstream();
    const response = await POST(
      new Request("http://web/api/audits", {
        method: "POST",
        headers: { cookie: SESSION_COOKIE },
        body: "{}",
      }),
      ctx("audits"),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the identity contract for a signed-in user and overwrites spoofed headers", async () => {
    getSessionUser.mockResolvedValue({
      id: "u1",
      email: "real@lab.test",
      name: "Real User",
      isAdmin: false,
    });
    const fetchMock = stubUpstream();
    await GET(
      new Request("http://web/api/runs", {
        headers: {
          cookie: SESSION_COOKIE,
          "X-Wcag-User-Email": "admin@lab.test",
          "X-Wcag-User-Name": "Fake",
          "X-Wcag-Internal-Token": "guess",
          "X-Wcag-Extra": "1",
        },
      }),
      ctx("runs"),
    );
    const headers = sentHeaders(fetchMock);
    expect(headers.get("x-wcag-user-email")).toBe("real@lab.test");
    expect(headers.get("x-wcag-user-name")).toBe("Real User");
    expect(headers.get("x-wcag-internal-token")).toBe("internal-secret");
    expect(headers.get("x-wcag-extra")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
  });

  it("never proxies auth paths to the audit service", async () => {
    const fetchMock = stubUpstream();
    const response = await GET(
      new Request("http://web/api/auth/get-session"),
      ctx("auth", "get-session"),
    );
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
