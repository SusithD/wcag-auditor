import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE = resolve(__dirname, "../../../fixtures/real");

test("a fixture-folder run shows progress and lands on the report with the screenshot visible", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const listing = await request.get("/api/runs");
  expect(listing.ok()).toBe(true);
  const folder = `${FIXTURE}/real_com_011_mobile_20261004T054738Z`;
  const created = await request.post("/api/runs", { data: { folder } });
  expect(created.status()).toBe(201);
  const { run_id } = await created.json();

  await page.goto(`/runs/${run_id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit report" }),
  ).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  const shot = page.getByRole("img", { name: /Full-page screenshot/ });
  await expect(shot).toBeVisible();
  await expect
    .poll(() => shot.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
});

test("a queued run can be cancelled from the progress screen after confirming", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const first = await request.post("/api/runs", {
    data: { folder: `${FIXTURE}/real_com_003_desktop_20261004T054402Z` },
  });
  const second = await request.post("/api/runs", {
    data: { folder: `${FIXTURE}/real_com_011_mobile_20261004T054738Z` },
  });
  const queuedId = (await second.json()).run_id;
  await page.goto(`/runs/${queuedId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Cancel audit" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel audit" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit cancelled" }),
  ).toBeVisible();
  const body = await (await request.get(`/api/runs/${queuedId}`)).json();
  expect(body.status).toBe("cancelled");
  const firstId = (await first.json()).run_id;
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/runs/${firstId}`)).json()).status,
      {
        timeout: 120_000,
      },
    )
    .toBe("done");
});

test("progress shows the stepper, one live region and a cancel confirmation", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const folder = `${FIXTURE}/real_com_003_desktop_20261004T054402Z`;
  const created = await request.post("/api/runs", { data: { folder } });
  const { run_id } = await created.json();
  await page.goto(`/runs/${run_id}`);
  await expect(page.getByRole("heading", { name: "Steps" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Steps" })).toBeVisible();
  await expect(page.locator("[role=status], output")).toHaveCount(1);
  await expect(page.locator('[aria-current="step"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel audit" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep auditing" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit report" }),
  ).toBeVisible({
    timeout: 90_000,
  });
});

test("the New Audit form can be completed with the keyboard alone", async ({
  page,
}) => {
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  const urlField = page.getByRole("textbox", { name: "Web address" });

  async function tabTo(locator: ReturnType<typeof page.locator>, max = 40) {
    for (let i = 0; i < max; i += 1) {
      await page.keyboard.press("Tab");
      if (await locator.evaluate((el) => el === document.activeElement)) return;
    }
    throw new Error("element was not reachable with Tab");
  }

  await tabTo(urlField);
  await page.keyboard.type("ftp://nope");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Enter a full address/)).toBeVisible();
  await expect(urlField).toHaveAttribute("aria-invalid", "true");
  await expect(urlField).toBeFocused();

  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(`http://localhost:${new URL(page.url()).port}/`);
  await expect(urlField).not.toHaveAttribute("aria-invalid", "true");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox", { name: /Desktop/ })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("checkbox", { name: /Desktop/ }),
  ).not.toBeChecked();

  await tabTo(page.getByRole("button", { name: /^Run audit/ }));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/runs\/[0-9a-f]{32}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit report" }),
  ).toBeVisible({
    timeout: 120_000,
  });
  await expect(
    page.getByRole("img", { name: /Full-page screenshot/ }),
  ).toBeVisible();
});

test("selecting no viewport is rejected inline without leaving the page", async ({
  page,
}) => {
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  await page.getByRole("textbox", { name: "Web address" }).fill("example.com");
  await page.getByRole("checkbox", { name: /Desktop/ }).uncheck();
  await page.getByRole("checkbox", { name: /Mobile/ }).uncheck();
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(page.locator("form [role=alert]")).toContainText(
    "at least one viewport",
  );
  await expect(page).toHaveURL(/\/audit\/new$/);
});

test("text that is not a web address is rejected inline and keeps focus on the field", async ({
  page,
}) => {
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  const field = page.getByRole("textbox", { name: "Web address" });
  await field.fill("not a url ///");
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(
    page.getByText("Enter a full address such as https://example.com"),
  ).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toBeFocused();
  await expect(page).toHaveURL(/\/audit\/new$/);
});

test("both viewport cards are reachable with Tab", async ({ page }) => {
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  await page.getByRole("textbox", { name: "Web address" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox", { name: /Desktop/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox", { name: /Mobile/ })).toBeFocused();
});

test("a failed run explains the problem in plain words and offers a way forward", async ({
  page,
}) => {
  const id = "b".repeat(32);
  await page.route(`**/api/runs/${id}`, (r) =>
    r.fulfill({
      json: {
        id,
        created_at: "2026-10-10T12:00:00",
        source_kind: "url",
        source: "https://nonexistent.invalid",
        viewports: ["desktop"],
        condition: "hybrid",
        status: "failed",
        stage_status: {},
        error:
          "Page.goto: net::ERR_NAME_NOT_RESOLVED at https://nonexistent.invalid/",
        counts: { critical: 0, serious: 0, minor: 0, needs_review: 0 },
        available_viewports: [],
      },
    }),
  );
  await page.route(`**/api/runs/${id}/events`, (r) =>
    r.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.goto(`/runs/${id}`);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "The tool could not reach that address. Check it and try again.",
  );
  await expect(page.getByText("Page.goto")).toBeHidden();
  await expect(page.getByText("What went wrong")).toBeFocused();
  await page.getByRole("button", { name: "Technical details" }).click();
  await expect(page.getByText(/ERR_NAME_NOT_RESOLVED/)).toBeVisible();
  await expect(page).toHaveTitle(/Audit failed - /);
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible();
  await page.getByRole("link", { name: "Start a new audit" }).click();
  await expect(page).toHaveURL(/\/audit\/new$/);
});

test("a bot-checked run says so and offers to audit screenshots instead", async ({
  page,
}) => {
  const id = "c".repeat(32);
  const message =
    "The site showed a bot check (Cloudflare) instead of the page, so the audit was stopped. Audit a page without bot protection, or upload screenshots instead.";
  await page.route(`**/api/runs/${id}`, (r) =>
    r.fulfill({
      json: {
        id,
        created_at: "2026-10-10T12:00:00",
        source_kind: "url",
        source: "https://buy.example.com",
        viewports: ["desktop"],
        condition: "hybrid",
        status: "failed",
        stage_status: {},
        error: message,
        counts: { critical: 0, serious: 0, minor: 0, needs_review: 0 },
        available_viewports: [],
      },
    }),
  );
  await page.route(`**/api/runs/${id}/events`, (r) =>
    r.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.goto(`/runs/${id}`);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "The site showed a bot check instead of the page, so the audit was stopped.",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit failed" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Audit screenshots instead" }).click();
  await expect(page).toHaveURL(/\/audit\/new\?tab=screenshots$/);
  await expect(page.getByRole("tab", { name: "Screenshots" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("an unknown run and an unknown page have their own titles and a way back", async ({
  page,
}) => {
  await page.goto(`/runs/${"f".repeat(32)}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit not found" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Audit not found - WCAG Auditor");
  await expect(
    page.getByRole("link", { name: "Back to New audit" }),
  ).toBeVisible();
  await page.goto("/no-such-page");
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Page not found - WCAG Auditor");
});

test("client navigation updates the title and moves focus to the heading", async ({
  page,
}) => {
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  await page.getByRole("link", { name: "Evaluation" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page).toHaveTitle("Evaluation - WCAG Auditor");
  await expect(page.locator("head title")).toHaveCount(1);
  await page.getByRole("link", { name: "New audit" }).click();
  await expect(page).toHaveTitle("New audit - WCAG Auditor");
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

async function mockUpload(page: import("@playwright/test").Page) {
  await page.route("**/api/uploads", (r) =>
    r.fulfill({ json: { upload_id: "u".repeat(32) } }),
  );
}

test("Rules only is unavailable on the Screenshots tab and the form says why", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "wcag-auditor.settings",
      JSON.stringify({ method: "rule_only" }),
    ),
  );
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  const rules = page.getByRole("radio", { name: /Rules only/ });
  await expect(rules).toBeChecked();
  await page.getByRole("tab", { name: "Screenshots" }).click();
  await expect(rules).toBeDisabled();
  await expect(rules).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: /Detector and rules/ }),
  ).toBeChecked();
  await expect(page.locator("form output")).toContainText(
    "Method changed to Detector and rules",
  );
  await expect(page.getByText(/Not available for screenshots/)).toBeVisible();
  await page.getByRole("tab", { name: "Web address" }).click();
  await expect(rules).toBeEnabled();
});

test("an API error from starting an audit shows inline as an alert", async ({
  page,
}) => {
  await mockUpload(page);
  await page.route("**/api/runs", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ status: 422, json: { detail: "Page could not be opened" } })
      : r.fallback(),
  );
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  await page.getByRole("textbox", { name: "Web address" }).fill("example.com");
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(page.locator("form [role=alert]")).toHaveText(
    "Page could not be opened",
  );
  await page.getByRole("tab", { name: "Screenshots" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(page.locator("form [role=alert]")).toHaveText(
    "Page could not be opened",
  );
  await expect(page).toHaveURL(/\/audit\/new$/);
});

test("Ctrl or Cmd+Enter submits from anywhere on New audit, but not over a dialog", async ({
  page,
}) => {
  await mockUpload(page);
  let posts = 0;
  await page.route("**/api/runs", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    posts += 1;
    return r.fulfill({ status: 422, json: { detail: "stop here" } });
  });
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  await page.getByRole("tab", { name: "Screenshots" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator("form [role=alert]")).toHaveText("stop here");
  expect(posts).toBe(1);

  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.waitForTimeout(300);
  expect(posts).toBe(1);
});
