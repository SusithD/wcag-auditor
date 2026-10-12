import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

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
const FOLDER = resolve(
  __dirname,
  "../../../fixtures/real/real_com_011_mobile_20261004T054738Z",
);
const SYNTH = resolve(__dirname, "../../../fixtures/synth/sc1-4-3");
const SHOT = readFileSync(
  resolve(SYNTH, readdirSync(SYNTH)[0], "screenshot.png"),
);
const RUNNING_ID = "a".repeat(32);
const FAILED_ID = "f".repeat(32);

let doneId: string | undefined;

async function ensureRun(request: APIRequestContext) {
  if (doneId) return doneId;
  const created = await request.post("/api/runs", { data: { folder: FOLDER } });
  const { run_id } = await created.json();
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/runs/${run_id}`)).json()).status,
      { timeout: 120_000 },
    )
    .toBe("done");
  doneId = run_id as string;
  return doneId;
}

const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => undefined)),
    ),
  );

async function scan(page: Page, label: string) {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast-enhanced"])
    .analyze();
  expect(
    results.violations.map((v) => `${label}: ${v.id} ${v.nodes[0]?.html}`),
  ).toEqual([]);
}

const hydrated = (page: Page) =>
  page.waitForFunction(() =>
    Object.keys(document.querySelector("nav a") ?? {}).some((k) =>
      k.startsWith("__reactFiber"),
    ),
  );

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

const runSummary = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  created_at: "2026-10-10T12:00:00Z",
  source_kind: "url",
  source: "https://marlowegreen.example/about/our-story",
  viewports: ["desktop", "mobile"],
  condition: "hybrid",
  status: "running",
  stage_status: {},
  error: null,
  counts: { critical: 0, serious: 0, minor: 0, needs_review: 0 },
  available_viewports: [],
  ...over,
});

const stage = (
  name: string,
  viewport: string | null = null,
  detail: string | null = null,
) =>
  `event: stage\ndata: ${JSON.stringify({ stage: name, viewport, detail })}\n\n`;

async function mockRunning(page: Page, id = RUNNING_ID, failed = false) {
  await page.route(`**/api/runs/${id}`, (r) =>
    r.fulfill({ json: runSummary(id) }),
  );
  await page.route(`**/api/runs/${id}/events`, (r) =>
    r.fulfill({
      contentType: "text/event-stream",
      body:
        stage("queued") +
        stage("capture:desktop", "desktop") +
        stage("captured:desktop", "desktop", "/x") +
        (failed
          ? stage(
              "failed:capture:mobile",
              "mobile",
              "Page.goto: Timeout 30000ms exceeded",
            )
          : "") +
        stage("rules", "desktop"),
    }),
  );
  await page.route(`**/api/runs/${id}/assets/desktop/screenshot`, (r) =>
    r.fulfill({ contentType: "image/png", body: SHOT }),
  );
}

const REASON_A =
  "text size and weight unknown: large-text status cannot be read from the screenshot, so the contrast threshold is not settled";
const REASON_B =
  "element box estimated by the detector from the screenshot: its real edge and size are unknown";

type Row = {
  id: number;
  sc: string;
  reason: string;
  site: string;
  status: string;
};

function reviewFinding(row: Row) {
  return {
    id: row.id,
    key: `f${row.id}`,
    viewport: "desktop",
    sc: row.sc,
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    focus_index: null,
    severity: "serious",
    tier: "needs-review",
    score: 0.9,
    provenance: "pixel",
    element: `p.item-${row.id}`,
    guidance: {
      sc_title: row.sc === "1.4.3" ? "Contrast (Minimum)" : "Non-text Contrast",
      level: "AA",
      understanding: "",
      what_failed: "The measured value is close to the threshold.",
      nearest_passing: "",
      fix_css: "",
      fix_html: "",
      techniques: [],
    },
    evidence_rows: [{ label: "Measured contrast", value: "3.8:1" }],
    has_crop: false,
    status: row.status,
    decision:
      row.status === "open"
        ? { status: "open" }
        : {
            status: row.status,
            reason: row.status === "dismissed" ? "Tool error" : null,
            note: null,
            decided_at: new Date().toISOString(),
            decided_by: "Local user",
          },
    needs_review_reason: row.reason,
  };
}

const seedRows = (status = "open"): Row[] => [
  {
    id: 1,
    sc: "1.4.3",
    reason: REASON_A,
    site: "marlowegreen.example/about",
    status,
  },
  {
    id: 2,
    sc: "1.4.3",
    reason: REASON_A,
    site: "kettleandcrumb.example",
    status,
  },
  {
    id: 3,
    sc: "1.4.11",
    reason: REASON_B,
    site: "fernlea-health.example",
    status,
  },
];

async function mockReview(page: Page, rows: Row[]) {
  await page.route(/\/api\/review(\?|$)/, async (route) => {
    const state =
      new URL(route.request().url()).searchParams.get("state") ?? "waiting";
    const waiting = new Set(["open", "unsure"]);
    const picked = rows.filter((r) =>
      state === "all"
        ? true
        : state === "waiting"
          ? waiting.has(r.status)
          : !waiting.has(r.status),
    );
    const counts = new Map<string, number>();
    for (const r of picked)
      counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    await route.fulfill({
      json: {
        items: picked.map((r) => ({
          finding: reviewFinding(r),
          run_id: "a".repeat(32),
          source: `https://${r.site}`,
          site: r.site,
          viewport: "desktop",
          created_at: new Date(Date.now() - 12 * 60_000).toISOString(),
        })),
        counts_by_reason: [...counts].map(([reason, count]) => ({
          reason,
          count,
        })),
        total: picked.length,
      },
    });
  });
}

const listRun = (id: string, status: string, source: string) =>
  runSummary(id, {
    status,
    source,
    counts: { critical: 1, serious: 2, minor: 3, needs_review: 4 },
    available_viewports: ["desktop"],
  });

async function mockLists(page: Page) {
  const runs = [
    listRun("a".repeat(32), "done", "https://marlowegreen.example/about"),
    listRun("b".repeat(32), "failed", "https://kettleandcrumb.example"),
  ];
  await page.route(/\/api\/runs(\?.*)?$/, (r) => r.fulfill({ json: runs }));
  await page.route(/\/api\/sites$/, (r) =>
    r.fulfill({
      json: runs.map((run, i) => ({
        site: run.source.replace("https://", ""),
        latest_run: run,
        previous_run_id: i === 0 ? "d".repeat(32) : null,
        failures: 3,
        failures_delta: i === 0 ? -2 : null,
        to_review: 4,
        criteria_decided: 5,
      })),
    }),
  );
}

async function mockEmpty(page: Page) {
  await page.route("**/api/sites", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/summary/week*", (r) =>
    r.fulfill({
      json: {
        audits_this_week: 0,
        audits_last_week: 0,
        fixes_verified_this_week: 0,
        decisions_this_week: 0,
        median_criteria_decided: 0,
        running: [],
        fixes_to_verify: { findings: 0, sites: 0 },
      },
    }),
  );
  await page.route(/\/api\/review(\?|$)/, (r) =>
    r.fulfill({ json: { items: [], total: 0, counts_by_reason: [] } }),
  );
  await page.route("**/api/runs?**", (r) => r.fulfill({ json: [] }));
}

test.describe("320 px reflow", () => {
  test.use({ viewport: { width: 320, height: 700 } });

  const STATIC = [
    "/",
    "/audit/new",
    "/review",
    "/sites",
    "/audits",
    "/settings",
    "/help",
    "/eval",
    "/study/admin",
    "/nowhere",
  ];

  for (const path of STATIC) {
    test(`${path} has no page scroll at 320 px`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test("a running run has no page scroll at 320 px", async ({ page }) => {
    await mockRunning(page);
    await page.goto(`/runs/${RUNNING_ID}`);
    await expect(
      page.getByRole("img", { name: /Desktop capture of/ }),
    ).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  for (const suffix of ["", "/coverage", "/compare"]) {
    test(`a done run${suffix || " report"} has no page scroll at 320 px`, async ({
      page,
      request,
    }) => {
      test.setTimeout(150_000);
      const id = await ensureRun(request);
      await page.goto(`/runs/${id}${suffix}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

const SIDEBAR: { name: string; nav: string; heading: RegExp | string }[] = [
  { name: "Audits", nav: "Main", heading: "Audits" },
  { name: "Review queue", nav: "Main", heading: "Review queue" },
  { name: "Sites", nav: "Main", heading: "Sites" },
  { name: "Evaluation", nav: "Main", heading: /Evaluation/ },
  { name: "Settings", nav: "Settings and help", heading: "Settings" },
  { name: "Help and method", nav: "Settings and help", heading: /Help/ },
];

test.describe("focus on route change", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("each sidebar link moves focus to the level-1 heading", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await hydrated(page);
    for (const item of SIDEBAR) {
      await page
        .getByRole("navigation", { name: item.nav })
        .getByRole("link", { name: new RegExp(`^${item.name}`) })
        .click();
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveText(item.heading);
      await expect(h1).toBeFocused();
    }
  });

  test("command palette navigation moves focus to the level-1 heading", async ({
    page,
  }) => {
    await page.goto("/audits");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await hydrated(page);
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox")).toBeFocused();
    await page.keyboard.type("review");
    await expect(
      dialog.getByRole("option", { name: "Review queue" }),
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/review$/);
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review queue" }),
    ).toBeFocused();
  });

  test("Esc closes the command palette and returns focus to the Search button", async ({
    page,
  }) => {
    await page.goto("/audits");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await hydrated(page);
    const search = page.getByRole("button", { name: /^Search/ });
    await search.click();
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(search).toBeFocused();
  });

  test("the browser back and forward buttons move focus to the level-1 heading", async ({
    page,
  }) => {
    await page.goto("/audits");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await hydrated(page);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: /^Review queue/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review queue" }),
    ).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(/\/audits$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Audits" }),
    ).toBeFocused();
    await page.goForward();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review queue" }),
    ).toBeFocused();
  });
});

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

for (const scheme of ["light", "dark"] as const) {
  for (const size of SIZES) {
    const tag = `${scheme}, ${size.width}`;
    test.describe(`axe states (${tag})`, () => {
      test.use({ viewport: size, colorScheme: scheme });

      test(`running progress and the cancel dialog (${tag})`, async ({
        page,
      }) => {
        await mockRunning(page);
        await page.goto(`/runs/${RUNNING_ID}`);
        await expect(
          page.getByRole("img", { name: /Desktop capture of/ }),
        ).toBeVisible();
        await scan(page, `progress ${tag}`);
        await page.getByRole("button", { name: "Cancel audit" }).click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        await scan(page, `cancel dialog ${tag}`);
      });

      test(`partial failure alert (${tag})`, async ({ page }) => {
        await mockRunning(page, FAILED_ID, true);
        await page.goto(`/runs/${FAILED_ID}`);
        await expect(
          page.getByRole("alert").filter({ hasText: "capture failed" }),
        ).toBeVisible();
        await scan(page, `partial failure ${tag}`);
      });

      test(`review reason error and bulk bar (${tag})`, async ({ page }) => {
        await mockReview(page, seedRows());
        await page.goto("/review");
        await expect(
          page.getByRole("radiogroup", { name: "Your decision" }),
        ).toBeVisible();
        await page.getByRole("radio", { name: /Dismiss/ }).check();
        await page.getByRole("button", { name: "Save and next" }).click();
        await expect(page.locator("#review-error")).toContainText(
          "Choose a reason for dismissing",
        );
        await scan(page, `review reason error ${tag}`);
        await page
          .getByRole("checkbox", { name: /Select 1.4.3/ })
          .first()
          .check();
        await page.getByRole("button", { name: "Dismiss…" }).click();
        await expect(
          page
            .getByRole("region", { name: "Bulk actions" })
            .getByRole("group", { name: "Choose a reason for dismissing" }),
        ).toBeVisible();
        await scan(page, `review bulk bar ${tag}`);
      });

      test(`review decided state (${tag})`, async ({ page }) => {
        await mockReview(page, seedRows("confirmed"));
        await page.goto("/review?state=decided");
        await expect(
          page.getByRole("heading", { level: 1, name: "Review queue" }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: /Text size and weight unknown/ }),
        ).toBeVisible();
        await scan(page, `review decided ${tag}`);
      });

      for (const [path, heading] of [
        ["/settings", "Settings"],
        ["/help", /Help/],
        ["/sites", "Sites"],
        ["/audits", "Audits"],
        ["/nowhere", "Page not found"],
      ] as const) {
        test(`${path} (${tag})`, async ({ page }) => {
          await mockLists(page);
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            heading,
          );
          if (path === "/sites" || path === "/audits")
            await expect(page.getByRole("table")).toBeVisible();
          await scan(page, `${path} ${tag}`);
        });
      }

      test(`first-run overview (${tag})`, async ({ page }) => {
        await mockEmpty(page);
        await page.goto("/");
        await expect(
          page.getByRole("heading", { name: "How it works" }),
        ).toBeVisible();
        await scan(page, `first run ${tag}`);
      });
    });
  }
}

type ApiFinding = {
  id: number;
  key: string;
  status: string;
  decision: { reason: string | null };
};
type ReviewItem = { run_id: string; viewport: string; finding: ApiFinding };

test("a real finding is confirmed from the review queue, then undone", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await ensureRun(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  const waiting = async () =>
    (await (await request.get("/api/review?state=waiting&limit=500")).json())
      .items as ReviewItem[];
  const before = await waiting();
  test.skip(before.length === 0, "no needs-review findings in the fixtures");
  await page.goto("/review");
  await expect(
    page.getByRole("radiogroup", { name: "Your decision" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Confirm issue/ }).check();
  await page.getByRole("button", { name: "Save and next" }).click();
  await expect(page.getByRole("status")).toContainText("Saved: Confirmed");
  const after = await waiting();
  const gone = before.filter(
    (b) => !after.some((a) => a.finding.id === b.finding.id),
  );
  expect(gone).toHaveLength(1);
  const { run_id, viewport, finding } = gone[0];
  const stored = async () =>
    (
      (await (
        await request.get(`/api/runs/${run_id}/findings?viewport=${viewport}`)
      ).json()) as ApiFinding[]
    ).find((f) => f.id === finding.id);
  await expect.poll(async () => (await stored())?.status).toBe("confirmed");
  await page
    .locator("section[aria-labelledby=recent-decided-h]")
    .getByRole("button", { name: /^Undo decision/ })
    .click();
  await expect(page.getByRole("status")).toContainText("Decision undone");
  await expect.poll(async () => (await stored())?.status).toBe("open");
  expect((await stored())?.decision.reason ?? null).toBeNull();
});

test("with an empty review queue the report can dismiss with a reason and reopen", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const id = await ensureRun(request);
  const queue = await (await request.get("/api/review?state=waiting")).json();
  test.skip(queue.items.length > 0, "the review queue has items");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/runs/${id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit report" }),
  ).toBeVisible();
  await page
    .locator("svg [role=button][data-key]")
    .last()
    .locator("rect[data-hit]")
    .click();
  await expect(page).toHaveURL(/f=f\d+/);
  const key = new URL(page.url()).searchParams.get("f") ?? "";
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tool error" }).click();
  await expect(page.getByTestId("decision-notice")).toContainText("Dismissed");
  const stored = async () =>
    (
      (await (
        await request.get(`/api/runs/${id}/findings?viewport=mobile`)
      ).json()) as ApiFinding[]
    ).find((f) => f.key === key);
  await expect.poll(async () => (await stored())?.status).toBe("dismissed");
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect.poll(async () => (await stored())?.status).toBe("open");
  expect((await stored())?.decision.reason ?? null).toBeNull();
});

test("settings persist through a reload and turn shortcuts off on a report", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const id = await ensureRun(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Compact/ }).check();
  await page.getByRole("checkbox", { name: /Single-key shortcuts/ }).uncheck();
  await expect(page.getByRole("status")).toContainText("saved on this device");
  await page.reload();
  await expect(page.getByRole("radio", { name: /Compact/ })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Single-key shortcuts/ }),
  ).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");

  await page.goto(`/runs/${id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit report" }),
  ).toBeVisible();
  const boxes = page.locator("svg [role=button][data-key]");
  await boxes.last().locator("rect[data-hit]").click();
  await expect(page).toHaveURL(/f=f\d+/);
  const selected = new URL(page.url()).searchParams.get("f");
  await page.locator("body").press("j");
  await boxes.last().press("j");
  await expect(page.getByTestId("report-status")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("f")).toBe(selected);
});
