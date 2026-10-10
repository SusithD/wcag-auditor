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
  await expect(
    page.getByRole("link", { name: "Open HTML report" }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("heading", { level: 1, name: "Auditing" }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("navigation", { name: "Audit steps" }),
  ).toBeVisible();
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
  await page.goto("/");
  await page.locator("form[data-ready=true]").waitFor();
  const urlField = page.getByLabel("Web address");

  async function tabTo(locator: ReturnType<typeof page.locator>, max = 14) {
    for (let i = 0; i < max; i += 1) {
      await page.keyboard.press("Tab");
      if (await locator.evaluate((el) => el === document.activeElement)) return;
    }
    throw new Error("element was not reachable with Tab");
  }

  await tabTo(urlField);
  await page.keyboard.type("ftp://nope");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/starts with http/)).toBeVisible();
  await expect(urlField).toHaveAttribute("aria-invalid", "true");
  await expect(urlField).toBeFocused();

  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(`http://localhost:${new URL(page.url()).port}/`);
  await expect(urlField).not.toHaveAttribute("aria-invalid", "true");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Desktop" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Desktop" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await tabTo(page.getByRole("button", { name: /^Audit/ }));
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
  await page.goto("/");
  await page.locator("form[data-ready=true]").waitFor();
  await page.getByLabel("Web address").fill("example.com");
  await page.getByRole("button", { name: "Desktop" }).click();
  await page.getByRole("button", { name: "Mobile" }).click();
  await page.getByRole("button", { name: /^Audit/ }).click();
  await expect(page.locator("form [role=alert]")).toContainText(
    "at least one viewport",
  );
  await expect(page).toHaveURL(/\/$/);
});
