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

const run = (over: Record<string, unknown>) => ({
  id: "a".repeat(32),
  created_at: "2026-10-11T21:40:00",
  source_kind: "url",
  source: "https://marlowegreen.example/about/our-story",
  viewports: ["desktop", "mobile"],
  condition: "hybrid",
  status: "done",
  stage_status: {},
  error: null,
  counts: { critical: 0, serious: 2, minor: 4, needs_review: 2 },
  available_viewports: ["desktop", "mobile"],
  ...over,
});

const SITES = [
  {
    site: "marlowegreen.example/about/our-story",
    latest_run: run({}),
    previous_run_id: "c".repeat(32),
    failures: 6,
    failures_delta: -3,
    to_review: 2,
    criteria_decided: 6,
  },
  {
    site: "fernlea-health.example/appointments",
    latest_run: run({
      id: "b".repeat(32),
      source: "https://fernlea-health.example/appointments",
      viewports: ["desktop"],
      status: "running",
      counts: { critical: 0, serious: 0, minor: 0, needs_review: 0 },
    }),
    previous_run_id: null,
    failures: 0,
    failures_delta: null,
    to_review: 0,
    criteria_decided: 0,
  },
  {
    site: "thistlebank.example/classes",
    latest_run: run({
      id: "d".repeat(32),
      source: "https://thistlebank.example/classes",
      viewports: ["mobile"],
      status: "failed",
      error: "Page.goto: Timeout 30000ms exceeded",
      counts: { critical: 0, serious: 0, minor: 0, needs_review: 0 },
    }),
    previous_run_id: null,
    failures: 0,
    failures_delta: null,
    to_review: 0,
    criteria_decided: 0,
  },
];

const WEEK = {
  audits_this_week: 6,
  audits_last_week: 4,
  fixes_verified_this_week: 14,
  decisions_this_week: 37,
  median_criteria_decided: 6,
  running: [
    {
      run_id: "b".repeat(32),
      source: "https://fernlea-health.example/appointments",
      status: "running",
      stage_status: {},
    },
  ],
  fixes_to_verify: { findings: 9, sites: 3 },
};

const REVIEW = {
  items: [],
  total: 312,
  counts_by_reason: [
    {
      reason: "text size and weight unknown: large-text status cannot be read",
      count: 118,
    },
    {
      reason: "element box estimated by the detector from the screenshot",
      count: 74,
    },
    {
      reason: "icon colour estimated from anti-aliased pixels (O2)",
      count: 46,
    },
  ],
};

async function mock(page: Page, sites: unknown[]) {
  await page.route("**/api/sites", (r) => r.fulfill({ json: sites }));
  await page.route("**/api/summary/week*", (r) => r.fulfill({ json: WEEK }));
  await page.route("**/api/review**", (r) => r.fulfill({ json: REVIEW }));
  await page.route("**/api/runs?**", (r) => r.fulfill({ json: [] }));
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast-enhanced"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("the overview states the situation honestly and lists sites with their latest audit", async ({
  page,
}) => {
  await mock(page, SITES);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  await expect(
    page.getByText("One audit is running and 312 findings are waiting"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "8 of 86 WCAG 2.2 criteria checked. Not a conformance claim.",
    ),
  ).toBeVisible();
  await expect(page).toHaveTitle("Overview - WCAG Auditor");

  const cont = page.getByRole("region", { name: "Continue" });
  await expect(cont.getByText("9 findings marked as fixed")).toBeVisible();
  await expect(cont.getByText("Text size and weight unknown")).toBeVisible();
  await expect(
    cont.getByRole("link", { name: /View progress/ }),
  ).toHaveAttribute("href", `/runs/${"b".repeat(32)}`);

  const sites = page.getByRole("region", { name: "Sites" });
  await expect(sites.getByText("3 fewer since last audit")).toBeVisible();
  await expect(sites.getByText("No report yet")).toBeVisible();
  await expect(sites.getByText("Audit failed: timed out")).toBeVisible();
  await expect(
    sites.getByRole("link", { name: "marlowegreen.example" }),
  ).toBeVisible();
  await expect(
    sites.getByRole("img", { name: "6 of 8 criteria decided" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "This week" })).toContainText(
    "2 more than last week",
  );
  await expect(
    page.getByRole("region", { name: "Method and limits" }),
  ).toContainText("8 of the 86");
});

test("the site filter narrows the table and announces the result", async ({
  page,
}) => {
  await mock(page, SITES);
  await page.goto("/");
  const sites = page.getByRole("region", { name: "Sites" });
  await sites.getByRole("button", { name: "Running" }).click();
  await expect(
    sites.getByRole("link", { name: "fernlea-health.example" }),
  ).toBeVisible();
  await expect(
    sites.getByRole("link", { name: "thistlebank.example" }),
  ).toBeHidden();
  await expect(sites.getByRole("button", { name: "Running" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await sites.getByRole("button", { name: "With failures" }).click();
  await expect(
    sites.getByRole("link", { name: "marlowegreen.example" }),
  ).toBeVisible();
  await expect(
    sites.getByRole("link", { name: "fernlea-health.example" }),
  ).toBeHidden();
});

test("with no audits the overview offers a composer and no metrics", async ({
  page,
}) => {
  await mock(page, []);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Run your first audit" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How it works" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "This week" })).toHaveCount(0);
  const field = page.getByRole("textbox", { name: "Web address" });
  await field.fill("not a url ///");
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(
    page.getByText("Enter a full address such as https://example.com"),
  ).toBeVisible();
  await expect(field).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
});

test("an unreachable service shows an error with a retry", async ({ page }) => {
  await page.route("**/api/sites", (r) => r.fulfill({ status: 500, json: {} }));
  await page.route("**/api/summary/week*", (r) =>
    r.fulfill({ status: 500, json: {} }),
  );
  await page.route("**/api/review**", (r) =>
    r.fulfill({ status: 500, json: {} }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The overview could not be loaded" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const state of ["with sites", "first run"] as const) {
      test(`overview ${state} has zero axe violations (${scheme}, ${size.width})`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.emulateMedia({ colorScheme: scheme });
        await mock(page, state === "first run" ? [] : SITES);
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Overview",
        );
        if (state === "with sites")
          await expect(
            page.getByRole("region", { name: "Sites" }),
          ).toBeVisible();
        else
          await expect(
            page.getByRole("heading", { name: "How it works" }),
          ).toBeVisible();
        await scan(page);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }

    test(`new audit page has zero axe violations (${scheme}, ${size.width})`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      await mock(page, SITES);
      await page.route("**/api/runs?**", (r) => r.fulfill({ json: [run({})] }));
      await page.goto("/audit/new");
      await page.locator("form[data-ready=true]").waitFor();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "New audit",
      );
      await expect(
        page.getByRole("button", {
          name: "Run again for marlowegreen.example",
        }),
      ).toBeVisible();
      await scan(page);
    });
  }
}

test("the new audit form posts the chosen options and keeps validation inline", async ({
  page,
}) => {
  await page.route("**/api/runs?**", (r) => r.fulfill({ json: [] }));
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/runs", async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    body = r.request().postDataJSON();
    await r.fulfill({ status: 201, json: { run_id: "e".repeat(32) } });
  });
  await page.route(`**/api/runs/${"e".repeat(32)}**`, (r) =>
    r.fulfill({ status: 404, json: { detail: "x" } }),
  );
  await page.goto("/audit/new");
  await page.locator("form[data-ready=true]").waitFor();
  await page.getByRole("textbox", { name: "Web address" }).fill("example.com");
  await page.getByRole("checkbox", { name: /Mobile/ }).uncheck();
  await page.getByRole("radio", { name: /Rules only/ }).check();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("Focus steps").fill("99");
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(
    page.getByText(/Enter a whole number from 5 to 30/),
  ).toBeVisible();
  await expect(page.getByLabel("Focus steps")).toBeFocused();
  await page.getByLabel("Focus steps").fill("12");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.waitForURL(/\/runs\/e{32}$/);
  expect(body).toEqual({
    url: "https://example.com",
    viewports: ["desktop"],
    condition: "rule_only",
    max_focus_steps: 12,
  });
});

test("a partly failed capture shows an alert on the progress screen, not a toast", async ({
  page,
}) => {
  const id = "f".repeat(32);
  await page.route(`**/api/runs/${id}`, (r) =>
    r.fulfill({
      json: run({
        id,
        status: "running",
        counts: { critical: 0, serious: 0, minor: 0, needs_review: 0 },
        available_viewports: [],
      }),
    }),
  );
  const ev = (stage: string, viewport: string | null, detail: string | null) =>
    `event: stage\ndata: ${JSON.stringify({ stage, viewport, detail })}\n\n`;
  await page.route(`**/api/runs/${id}/events`, (r) =>
    r.fulfill({
      contentType: "text/event-stream",
      body:
        ev("queued", null, null) +
        ev("capture:desktop", "desktop", null) +
        ev(
          "failed:capture:mobile",
          "mobile",
          "Page.goto: Timeout 30000ms exceeded",
        ) +
        ev("rules", "desktop", null),
    }),
  );
  await page.goto(`/runs/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "marlowegreen.example",
  );
  const alert = page.getByRole("alert").filter({ hasText: "capture failed" });
  await expect(alert).toContainText("Mobile capture failed.");
  await expect(alert).toContainText("took too long");
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(page.locator("[role=status], output")).toHaveCount(1);
  await expect(page.getByText("Found so far")).toBeVisible();
});

const LONG_SITE = {
  site: "real_com_003_desktop_20261004T054402Z",
  latest_run: run({
    id: "f".repeat(32),
    source_kind: "folder",
    source: "/fixtures/real/real_com_003_desktop_20261004T054402Z",
    viewports: ["desktop", "mobile"],
    counts: { critical: 12, serious: 34, minor: 56, needs_review: 7 },
  }),
  previous_run_id: "c".repeat(32),
  failures: 102,
  failures_delta: 12,
  to_review: 7,
  criteria_decided: 8,
};

for (const width of [1440, 1024, 320]) {
  test(`the sites table keeps the page from scrolling sideways at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mock(page, [...SITES, LONG_SITE]);
    await page.goto("/");
    const panel = page.getByRole("region", { name: "Sites" });
    await expect(panel).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const fits = await panel.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return Array.from(el.querySelectorAll("table, td, th")).every(
        (cell) => cell.getBoundingClientRect().right <= box.right + 1,
      );
    });
    expect(fits).toBe(true);
  });
}
