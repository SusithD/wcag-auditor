import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

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
const RUN_ID = "a".repeat(32);
const SYNTH = resolve(__dirname, "../../../fixtures/synth/sc1-4-3");
const SHOT = readFileSync(
  resolve(SYNTH, readdirSync(SYNTH)[0], "screenshot.png"),
);

const summary = {
  id: RUN_ID,
  created_at: "2026-10-10T12:00:00Z",
  source_kind: "url",
  source: "https://example.com",
  viewports: ["desktop"],
  condition: "hybrid",
  status: "running",
  stage_status: {},
  error: null,
  counts: { critical: 0, serious: 0, minor: 0, needs_review: 0 },
  available_viewports: [],
};

const stage = (
  name: string,
  viewport: string | null = null,
  detail: string | null = null,
) =>
  `event: stage\ndata: ${JSON.stringify({ stage: name, viewport, detail })}\n\n`;

const ROUTES = [
  { name: "/", path: "/", mock: false },
  { name: "/runs/[id] (progress)", path: `/runs/${RUN_ID}`, mock: true },
];

for (const scheme of ["light", "dark"] as const) {
  for (const route of ROUTES) {
    test(`${route.name} has zero axe violations (${scheme})`, async ({
      page,
    }) => {
      if (route.mock) {
        await page.route(`**/api/runs/${RUN_ID}`, (r) =>
          r.fulfill({ json: summary }),
        );
        await page.route(`**/api/runs/${RUN_ID}/events`, (r) =>
          r.fulfill({
            contentType: "text/event-stream",
            body:
              stage("queued") +
              stage("capture:desktop", "desktop") +
              stage("captured:desktop", "desktop", "/x") +
              stage("module:1.4.3", "desktop"),
          }),
        );
        await page.route(
          `**/api/runs/${RUN_ID}/assets/desktop/screenshot`,
          (r) => r.fulfill({ contentType: "image/png", body: SHOT }),
        );
      }
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(route.path);
      await expect(page.locator("html")).toHaveClass(
        scheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      if (route.mock)
        await expect(
          page.getByRole("img", { name: /Full-page screenshot/ }),
        ).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(TAGS)
        .disableRules(["color-contrast-enhanced"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

const FOLDER = resolve(
  __dirname,
  "../../../fixtures/real/real_com_011_mobile_20261004T054738Z",
);

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast-enhanced"])
    .analyze();
  expect(results.violations).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`form states have zero axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await page.locator("form[data-ready=true]").waitFor();
    await page.getByRole("button", { name: "Advanced" }).click();
    await page.getByLabel("Web address").fill("ftp://x");
    await page.getByRole("button", { name: /^Audit/ }).click();
    await expect(page.getByText(/starts with http/)).toBeVisible();
    await scan(page);
    await page.getByRole("tab", { name: "Screenshots" }).click();
    await scan(page);
  });

  test(`a real queued run and the finished report have zero axe violations (${scheme})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ colorScheme: scheme });
    const first = await request.post("/api/runs", { data: { folder: FOLDER } });
    const second = await request.post("/api/runs", {
      data: { folder: FOLDER },
    });
    const firstId = (await first.json()).run_id;
    const secondId = (await second.json()).run_id;
    await page.goto(`/runs/${secondId}`);
    await expect(
      page.getByRole("navigation", { name: "Audit steps" }),
    ).toBeVisible();
    await scan(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Audit report" }),
    ).toBeVisible({
      timeout: 120_000,
    });
    await expect(
      page.getByRole("img", { name: /Full-page screenshot/ }),
    ).toBeVisible();
    await scan(page);
    await page.goto(`/runs/${firstId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Audit report" }),
    ).toBeVisible();
  });
}
