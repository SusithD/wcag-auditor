import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  ADMIN,
  AUTH_STATE,
  expireInvite,
  GUEST_PASSWORD,
  INVITE_REQUIRED,
  inviteToken,
  SECOND_ADMIN_EMAIL,
} from "./auth-constants";

const TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "wcag2aaa",
  "wcag21aaa",
  "wcag22aaa",
];
const ANONYMOUS = { cookies: [], origins: [] };

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const guest = (label: string) => `${label}-${stamp}@guest.test`;

const authDb = () => process.env.E2E_AUTH_DB as string;

async function inviteViaApi(browser: Browser, email: string) {
  const context = await browser.newContext({ storageState: AUTH_STATE });
  const response = await context.request.post("/api/admin/invitations", {
    data: { email },
    headers: {
      Origin: new URL(test.info().project.use.baseURL as string).origin,
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { link: string };
  await context.close();
  return { link: body.link, token: inviteToken(body.link) };
}

async function signUp(page: Page, name: string, email: string, token?: string) {
  await page.goto(token ? `/login?invite=${token}` : "/login");
  if (!token)
    await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(GUEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
}

async function signOut(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("signed out", () => {
  test.use({ storageState: ANONYMOUS });

  test("the app redirects to /login with the original path", async ({
    page,
  }) => {
    await page.goto("/audits");
    await expect(page).toHaveURL(/\/login\?next=%2Faudits$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
  });

  test("the study participant pages work without a login", async ({ page }) => {
    await page.goto("/study");
    await expect(page).toHaveURL(/\/study$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const config = await page.request.get("/api/study/config");
    expect(config.status()).toBe(200);
  });

  test("study admin and other APIs need a session", async ({
    page,
    request,
  }) => {
    await page.goto("/study/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fstudy%2Fadmin$/);
    expect((await request.get("/api/runs")).status()).toBe(401);
    expect((await request.get("/api/admin/members")).status()).toBe(401);
  });

  test("sign-up without an invite link is rejected", async ({ page }) => {
    await signUp(page, "Stranger", guest("stranger"));
    await expect(page.getByTestId("auth-status")).toHaveText(INVITE_REQUIRED);
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign-up without a token is rejected for an admin address and over the API", async ({
    page,
    request,
  }) => {
    await signUp(page, "Squatter", SECOND_ADMIN_EMAIL);
    await expect(page.getByTestId("auth-status")).toHaveText(INVITE_REQUIRED);
    const origin = new URL(test.info().project.use.baseURL as string).origin;
    for (const email of [SECOND_ADMIN_EMAIL, guest("direct")]) {
      const variants: Record<string, string>[] = [
        { Origin: origin },
        { Origin: origin, "X-Invite-Token": "made-up-token" },
      ];
      for (const headers of variants) {
        const response = await request.post("/api/auth/sign-up/email", {
          data: { name: "Direct", email, password: GUEST_PASSWORD },
          headers,
        });
        expect(response.status()).toBe(403);
        expect((await response.json()).code).toBe("INVITE_REQUIRED");
      }
    }
  });

  test("the wrong password shows an inline error", async ({ page }) => {
    await signIn(page, ADMIN.email, "definitely-wrong-password");
    await expect(page.getByTestId("auth-status")).toContainText("do not match");
  });

  test("sign-up checks the password length inline", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Name").fill("Short");
    await page.getByLabel("Email").fill(guest("short"));
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).last().click();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  });

  test("login shows no social buttons and the admin-reset note when unconfigured", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /Continue with/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Ask an admin to reset your access"),
    ).toBeVisible();
  });
});

test.describe("invited member", () => {
  test.use({ storageState: ANONYMOUS });

  test("signs up, signs out, signs in, and cannot reach Members", async ({
    page,
    browser,
  }) => {
    const email = guest("member");
    const { token } = await inviteViaApi(browser, email.toUpperCase());
    await signUp(page, "Mia Member", email, token);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("user-menu")).toContainText("Mia Member");
    await expect(page.getByTestId("user-menu")).toContainText(email);

    await page.goto("/settings/members");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("link", { name: "Manage members" }),
    ).toHaveCount(0);
    const forbidden = await page.request.get("/api/admin/members");
    expect(forbidden.status()).toBe(403);

    await signOut(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);

    await signIn(page, email, GUEST_PASSWORD);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("user-menu")).toContainText("Mia Member");

    const again = await page.request.post("/api/auth/sign-up/email", {
      data: {
        name: "Mia",
        email: guest("member-again"),
        password: GUEST_PASSWORD,
      },
      headers: {
        "X-Invite-Token": token,
        Origin: new URL(test.info().project.use.baseURL as string).origin,
      },
    });
    expect(again.status()).toBe(403);
  });

  test("a used invite link cannot be used again", async ({ page, browser }) => {
    const email = guest("once");
    const { token } = await inviteViaApi(browser, email);
    await signUp(page, "First", email, token);
    await expect(page).toHaveURL(/\/$/);

    const other = await browser.newContext({ storageState: ANONYMOUS });
    const page2 = await other.newPage();
    await signUp(page2, "Second", email, token);
    await expect(page2.getByTestId("auth-status")).not.toHaveText("");
    await expect(page2).toHaveURL(/\/login/);
    await other.close();
  });

  test("an expired invite link is rejected", async ({ page, browser }) => {
    const email = guest("expired");
    const { token } = await inviteViaApi(browser, email);
    expireInvite(authDb(), email);
    await signUp(page, "Late", email, token);
    await expect(page.getByTestId("auth-status")).toHaveText(INVITE_REQUIRED);
  });

  test("an invite link only works for its own email", async ({
    page,
    browser,
  }) => {
    const owner = guest("owner");
    const { token } = await inviteViaApi(browser, owner);
    await signUp(page, "Thief", guest("thief"), token);
    await expect(page.getByTestId("auth-status")).toHaveText(INVITE_REQUIRED);

    const rightful = await browser.newContext({ storageState: ANONYMOUS });
    const page2 = await rightful.newPage();
    await signUp(page2, "Owner", owner.toUpperCase(), token);
    await expect(page2).toHaveURL(/\/$/);
    await rightful.close();
  });

  test("a re-issued link replaces the old one", async ({ page, browser }) => {
    const email = guest("reissue");
    const first = await inviteViaApi(browser, email);
    const second = await inviteViaApi(browser, email);
    expect(second.token).not.toBe(first.token);
    await signUp(page, "Old", email, first.token);
    await expect(page.getByTestId("auth-status")).toHaveText(INVITE_REQUIRED);
    await signUp(page, "New", email, second.token);
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("admin", () => {
  test("adds and revokes an invite, and removes a member", async ({
    page,
    browser,
  }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: "Manage members" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Members" }),
    ).toBeVisible();
    await expect(page.getByTestId("user-menu")).toContainText(ADMIN.email);

    const email = guest("invitee");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByRole("button", { name: "Add invite" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();

    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Add invite" }).click();
    await expect(
      page.getByRole("cell", { name: email, exact: true }),
    ).toBeVisible();
    const panel = page.getByTestId("invite-link-panel");
    const linkField = panel.getByLabel(`Invite link for ${email}`);
    const firstLink = await linkField.inputValue();
    expect(firstLink).toContain("/login?invite=");
    await expect(
      panel.getByRole("button", { name: "Copy link" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("cell", { name: email, exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("invite-link-panel")).toHaveCount(0);
    expect(await page.content()).not.toContain(inviteToken(firstLink));

    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Add invite" }).click();
    const secondLink = await page
      .getByTestId("invite-link-panel")
      .getByLabel(`Invite link for ${email}`)
      .inputValue();
    expect(secondLink).not.toBe(firstLink);

    await page
      .getByRole("button", { name: `Revoke invite for ${email}` })
      .click();
    await expect(
      page.getByRole("cell", { name: email, exact: true }),
    ).toHaveCount(0);

    const stranger = await browser.newContext({ storageState: ANONYMOUS });
    const page2 = await stranger.newPage();
    await signUp(page2, "Late", email, inviteToken(secondLink));
    await expect(page2.getByTestId("auth-status")).toHaveText(INVITE_REQUIRED);
    await stranger.close();

    const removable = guest("removable");
    await page.getByLabel("Email address").fill(removable);
    await page.getByRole("button", { name: "Add invite" }).click();
    await expect(
      page.getByRole("cell", { name: removable, exact: true }),
    ).toBeVisible();
    const removableToken = inviteToken(
      await page
        .getByTestId("invite-link-panel")
        .getByLabel(`Invite link for ${removable}`)
        .inputValue(),
    );
    const joiner = await browser.newContext({ storageState: ANONYMOUS });
    const page3 = await joiner.newPage();
    await signUp(page3, "Rae Removable", removable, removableToken);
    await expect(page3).toHaveURL(/\/$/);
    await page.reload();
    const row = page.getByRole("row", { name: /Rae Removable/ });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Remove ${removable}` }).click();
    await page.getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByRole("row", { name: /Rae Removable/ })).toHaveCount(
      0,
    );
    await page3.reload();
    await expect(page3).toHaveURL(/\/login/);
    await joiner.close();

    await expect(
      page.getByRole("button", { name: `Remove ${ADMIN.email}` }),
    ).toBeDisabled();
  });
});

async function scan(page: Page, label: string) {
  await page.evaluate(() =>
    Promise.allSettled(document.getAnimations().map((a) => a.finished)),
  );
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast-enhanced"])
    .analyze();
  expect(
    results.violations.map((v) => `${label}: ${v.id} ${v.nodes[0]?.html}`),
  ).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  for (const width of [1440, 390]) {
    const height = width === 1440 ? 900 : 844;
    test(`/login has zero axe violations (${scheme}, ${width})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: ANONYMOUS,
        colorScheme: scheme,
        viewport: { width, height },
      });
      const page = await context.newPage();
      await page.goto("/login");
      await expect(page.locator("html")).toHaveClass(
        scheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      await scan(page, "/login");
      await page.getByRole("button", { name: "Create account" }).click();
      await page.getByLabel("Email").fill("x");
      await page.getByRole("button", { name: "Create account" }).last().click();
      await expect(
        page.getByText("Enter a valid email address."),
      ).toBeVisible();
      await scan(page, "/login (errors)");
      await context.close();
    });

    test(`Members has zero axe violations (${scheme}, ${width})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: AUTH_STATE,
        colorScheme: scheme,
        viewport: { width, height },
      });
      const page = await context.newPage();
      await page.goto("/settings/members");
      await expect(page.locator("html")).toHaveClass(
        scheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      await expect(
        page.getByRole("cell", { name: ADMIN.email, exact: true }).first(),
      ).toBeVisible();
      await scan(page, "/settings/members");
      await context.close();
    });
  }
}
