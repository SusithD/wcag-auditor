import { describe, expect, it } from "vitest";
import {
  enabledProviders,
  isAdminEmail,
  isInviteAllowed,
  isValidEmail,
  parseAdminEmails,
  resetByEmailEnabled,
  socialProviderConfig,
} from "@/lib/auth/policy";

const admins = parseAdminEmails(" Boss@Lab.test, second@lab.test ,, ");
const invited = new Set(["guest@lab.test"]);
const isInvited = (email: string) => invited.has(email);

describe("invite enforcement", () => {
  it("parses ADMIN_EMAILS case-insensitively and ignores blanks", () => {
    expect([...admins].sort()).toEqual(["boss@lab.test", "second@lab.test"]);
    expect(parseAdminEmails(undefined).size).toBe(0);
  });

  it("allows admin emails without an invite, ignoring case", () => {
    expect(isInviteAllowed("BOSS@lab.test", admins, isInvited)).toBe(true);
  });

  it("allows invited emails, ignoring case and whitespace", () => {
    expect(isInviteAllowed("  Guest@LAB.test ", admins, isInvited)).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isInviteAllowed("stranger@lab.test", admins, isInvited)).toBe(false);
    expect(isInviteAllowed("", admins, isInvited)).toBe(false);
  });

  it("derives the admin role from ADMIN_EMAILS only", () => {
    expect(isAdminEmail("Second@Lab.test", admins)).toBe(true);
    expect(isAdminEmail("guest@lab.test", admins)).toBe(false);
  });

  it("validates invite addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.d")).toBe(false);
  });
});

describe("optional providers and mail", () => {
  it("enables a social provider only when both its variables are set", () => {
    expect(enabledProviders({})).toEqual({ google: false, github: false });
    expect(enabledProviders({ GOOGLE_CLIENT_ID: "id" }).google).toBe(false);
    expect(
      enabledProviders({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }),
    ).toEqual({ google: true, github: false });
    expect(
      enabledProviders({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "s" }),
    ).toEqual({ google: false, github: true });
  });

  it("only passes configured providers to Better Auth", () => {
    expect(socialProviderConfig({})).toEqual({});
    expect(
      socialProviderConfig({
        GITHUB_CLIENT_ID: "gid",
        GITHUB_CLIENT_SECRET: "gs",
      }),
    ).toEqual({ github: { clientId: "gid", clientSecret: "gs" } });
  });

  it("enables reset by email only with SMTP_URL and MAIL_FROM", () => {
    expect(resetByEmailEnabled({})).toBe(false);
    expect(resetByEmailEnabled({ SMTP_URL: "smtp://x" })).toBe(false);
    expect(
      resetByEmailEnabled({ SMTP_URL: "smtp://x", MAIL_FROM: "a@b.test" }),
    ).toBe(true);
  });
});
