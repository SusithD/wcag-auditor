import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
