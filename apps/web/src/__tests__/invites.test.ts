import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  authorizeUserCreation,
  githubUserInfo,
  parseAdminEmails,
} from "@/lib/auth/policy";
import {
  consumeInvite,
  DEFAULT_INVITE_TTL_DAYS,
  ensureInvitationSchema,
  generateInviteToken,
  hashInviteToken,
  hasSocialInvite,
  inviteLink,
  inviteTtlDays,
  issueInvite,
} from "../../scripts/invite-store.mjs";

const NOW = new Date("2026-10-12T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  ensureInvitationSchema(db);
});

describe("invite tokens", () => {
  it("generates 32 random bytes as unpadded base64url", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateInviteToken()).not.toBe(token);
  });

  it("hashes with sha256 and stores only the hash", () => {
    const { token } = issueInvite(db, {
      email: "A@b.test",
      invitedBy: "x",
      now: NOW,
    });
    const row = db.prepare("SELECT * FROM invitation").get() as Record<
      string,
      string
    >;
    expect(row.token_hash).toBe(hashInviteToken(token));
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.email).toBe("a@b.test");
  });

  it("builds the link and reads the TTL from the environment", () => {
    expect(inviteLink("https://x.test/", "tok")).toBe(
      "https://x.test/login?invite=tok",
    );
    expect(inviteTtlDays({})).toBe(DEFAULT_INVITE_TTL_DAYS);
    expect(inviteTtlDays({ INVITE_TTL_DAYS: "2" })).toBe(2);
    expect(inviteTtlDays({ INVITE_TTL_DAYS: "-3" })).toBe(
      DEFAULT_INVITE_TTL_DAYS,
    );
    expect(inviteTtlDays({ INVITE_TTL_DAYS: "abc" })).toBe(
      DEFAULT_INVITE_TTL_DAYS,
    );
  });
});

describe("consuming an invite", () => {
  it("accepts the right token and email, ignoring email case", () => {
    const { token } = issueInvite(db, {
      email: "a@b.test",
      invitedBy: "x",
      now: NOW,
    });
    expect(consumeInvite(db, { email: "A@B.TEST", token, now: NOW })).toBe(
      true,
    );
  });

  it("is single use", () => {
    const { token } = issueInvite(db, {
      email: "a@b.test",
      invitedBy: "x",
      now: NOW,
    });
    expect(consumeInvite(db, { email: "a@b.test", token, now: NOW })).toBe(
      true,
    );
    expect(consumeInvite(db, { email: "a@b.test", token, now: NOW })).toBe(
      false,
    );
  });

  it("rejects a token for a different email without burning it", () => {
    const { token } = issueInvite(db, {
      email: "a@b.test",
      invitedBy: "x",
      now: NOW,
    });
    expect(consumeInvite(db, { email: "c@d.test", token, now: NOW })).toBe(
      false,
    );
    expect(consumeInvite(db, { email: "a@b.test", token, now: NOW })).toBe(
      true,
    );
  });

  it("rejects wrong, empty and missing tokens", () => {
    issueInvite(db, { email: "a@b.test", invitedBy: "x", now: NOW });
    expect(
      consumeInvite(db, { email: "a@b.test", token: "nope", now: NOW }),
    ).toBe(false);
    expect(consumeInvite(db, { email: "a@b.test", token: "", now: NOW })).toBe(
      false,
    );
    expect(
      consumeInvite(db, { email: "a@b.test", token: null, now: NOW }),
    ).toBe(false);
  });

  it("expires after the TTL", () => {
    const { token, expiresAt } = issueInvite(db, {
      email: "a@b.test",
      invitedBy: "x",
      ttlDays: 7,
      now: NOW,
    });
    expect(expiresAt).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());
    const late = new Date(NOW.getTime() + 7 * DAY + 1);
    expect(consumeInvite(db, { email: "a@b.test", token, now: late })).toBe(
      false,
    );
    const early = new Date(NOW.getTime() + 7 * DAY - 1);
    expect(consumeInvite(db, { email: "a@b.test", token, now: early })).toBe(
      true,
    );
  });

  it("re-issuing replaces the old token and resets the used flag", () => {
    const first = issueInvite(db, {
      email: "a@b.test",
      invitedBy: "x",
      now: NOW,
    });
    expect(
      consumeInvite(db, { email: "a@b.test", token: first.token, now: NOW }),
    ).toBe(true);
    const second = issueInvite(db, {
      email: "a@b.test",
      invitedBy: "y",
      now: NOW,
    });
    expect(
      consumeInvite(db, { email: "a@b.test", token: first.token, now: NOW }),
    ).toBe(false);
    expect(
      consumeInvite(db, { email: "a@b.test", token: second.token, now: NOW }),
    ).toBe(true);
  });
});

describe("migrating the legacy invitation table", () => {
  it("adds the columns, keeps rows and never lets a legacy row take a password sign-up", () => {
    const legacy = new DatabaseSync(":memory:");
    legacy.exec(`CREATE TABLE invitation (
      email TEXT PRIMARY KEY NOT NULL,
      invited_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    legacy
      .prepare("INSERT INTO invitation (email, invited_by) VALUES (?, ?)")
      .run("old@b.test", "admin");
    ensureInvitationSchema(legacy);
    ensureInvitationSchema(legacy);
    const row = legacy.prepare("SELECT * FROM invitation").get() as Record<
      string,
      unknown
    >;
    expect(row.token_hash).toBeNull();
    expect(row.expires_at).toBeNull();
    expect(row.used_at).toBeNull();
    for (const token of ["", "x", "null"])
      expect(
        consumeInvite(legacy, { email: "old@b.test", token, now: NOW }),
      ).toBe(false);
    expect(hasSocialInvite(legacy, "old@b.test", NOW)).toBe(true);
  });
});

describe("social invites", () => {
  it("allows live and legacy rows, not expired or unknown ones", () => {
    issueInvite(db, { email: "a@b.test", invitedBy: "x", now: NOW });
    expect(hasSocialInvite(db, "A@b.test", NOW)).toBe(true);
    expect(
      hasSocialInvite(db, "a@b.test", new Date(NOW.getTime() + 8 * DAY)),
    ).toBe(false);
    expect(hasSocialInvite(db, "z@b.test", NOW)).toBe(false);
  });
});

describe("user creation policy", () => {
  const admins = parseAdminEmails("Admin@Lab.test");
  const calls: string[] = [];
  const checks = {
    admins,
    consumeInvite: (email: string, token: string) => {
      calls.push(`${email}:${token}`);
      return token === "good" && email === "guest@lab.test";
    },
    hasSocialInvite: (email: string) => email === "guest@lab.test",
  };
  const password = "/sign-up/email";

  it("requires a valid token for password sign-up", () => {
    const base = {
      email: "Guest@Lab.test",
      emailVerified: false,
      path: password,
    };
    expect(
      authorizeUserCreation({ ...base, inviteToken: "good" }, checks).ok,
    ).toBe(true);
    const missing = authorizeUserCreation(
      { ...base, inviteToken: null },
      checks,
    );
    expect(missing).toMatchObject({ ok: false, code: "INVITE_REQUIRED" });
    expect(
      authorizeUserCreation({ ...base, inviteToken: "bad" }, checks).ok,
    ).toBe(false);
  });

  it("does not exempt admin emails from the token", () => {
    const result = authorizeUserCreation(
      {
        email: "admin@lab.test",
        emailVerified: false,
        path: password,
        inviteToken: null,
      },
      checks,
    );
    expect(result).toMatchObject({ ok: false, code: "INVITE_REQUIRED" });
  });

  it("allows verified social sign-in for invited and admin emails", () => {
    for (const email of ["guest@lab.test", "ADMIN@lab.test"])
      expect(
        authorizeUserCreation(
          {
            email,
            emailVerified: true,
            path: "/callback/google",
            inviteToken: null,
          },
          checks,
        ).ok,
      ).toBe(true);
  });

  it("rejects unverified provider emails, even for admins", () => {
    for (const email of ["guest@lab.test", "admin@lab.test"])
      expect(
        authorizeUserCreation(
          {
            email,
            emailVerified: false,
            path: "/callback/github",
            inviteToken: null,
          },
          checks,
        ),
      ).toMatchObject({ ok: false, code: "PROVIDER_EMAIL_UNVERIFIED" });
  });

  it("rejects social sign-in for strangers and unknown contexts", () => {
    expect(
      authorizeUserCreation(
        {
          email: "who@lab.test",
          emailVerified: true,
          path: "/callback/google",
          inviteToken: null,
        },
        checks,
      ),
    ).toMatchObject({ ok: false, code: "NOT_INVITED" });
    expect(
      authorizeUserCreation(
        {
          email: "admin@lab.test",
          emailVerified: true,
          path: null,
          inviteToken: "good",
        },
        checks,
      ).ok,
    ).toBe(false);
  });
});

describe("github user info", () => {
  const respond = (profile: unknown, emails: unknown, emailsOk = true) =>
    (async (url: string) => {
      const isEmails = url.endsWith("/emails");
      const ok = isEmails ? emailsOk : true;
      return { ok, json: async () => (isEmails ? emails : profile) };
    }) as unknown as typeof fetch;

  it("uses the primary email and its verified flag", async () => {
    const info = await githubUserInfo(
      "t",
      respond({ id: 7, login: "me", email: "public@x.test" }, [
        { email: "public@x.test", primary: false, verified: true },
        { email: "main@x.test", primary: true, verified: false },
      ]),
    );
    expect(info?.user.email).toBe("main@x.test");
    expect(info?.user.emailVerified).toBe(false);
  });

  it("is verified only when the primary email is verified", async () => {
    const info = await githubUserInfo(
      "t",
      respond({ id: 7, login: "me" }, [
        { email: "main@x.test", primary: true, verified: true },
      ]),
    );
    expect(info?.user).toMatchObject({
      email: "main@x.test",
      emailVerified: true,
    });
  });

  it("is unverified when the emails endpoint fails", async () => {
    const info = await githubUserInfo(
      "t",
      respond({ id: 7, email: "public@x.test" }, [], false),
    );
    expect(info?.user.emailVerified).toBe(false);
  });
});
