import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

const FIXTURES = resolve(__dirname, "../../../fixtures/real");
const FOLDERS = {
  mobile: `${FIXTURES}/real_com_011_mobile_20261004T054738Z`,
  desktop: `${FIXTURES}/real_com_003_desktop_20261004T054402Z`,
} as const;
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

const runs = new Map<string, string>();

async function ensureRun(
  request: APIRequestContext,
  kind: keyof typeof FOLDERS,
) {
  const cached = runs.get(kind);
  if (cached) return cached;
  const created = await request.post("/api/runs", {
    data: { folder: FOLDERS[kind] },
  });
  const { run_id } = await created.json();
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/runs/${run_id}`)).json()).status,
      {
        timeout: 120_000,
      },
    )
    .toBe("done");
  runs.set(kind, run_id);
  return run_id as string;
}

async function openReport(page: Page, id: string, query = "") {
  await page.goto(`/runs/${id}${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit report" }),
  ).toBeVisible();
  if (!query.includes("view=table"))
    await expect(
      page.getByRole("img", { name: /Full-page screenshot/ }),
    ).toBeVisible();
}

const status = (page: Page) => page.getByTestId("report-status");

const openTable = (page: Page) =>
  page
    .getByRole("navigation", { name: "Report views" })
    .getByRole("link", { name: "Table", exact: true })
    .click();

const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );

const boxes = (page: Page) => page.locator("svg [role=button][data-key]");
const hit = (page: Page) =>
  boxes(page).last().locator("rect[data-hit]").click();
const tabStop = (page: Page) => page.locator("svg [role=button][tabindex='0']");

test.describe.configure({ mode: "serial" });

for (const scheme of ["light", "dark"] as const) {
  for (const kind of ["mobile", "desktop"] as const) {
    test(`report (${kind}, ${scheme}) has zero axe violations on canvas and table`, async ({
      page,
      request,
    }) => {
      test.setTimeout(150_000);
      const id = await ensureRun(request, kind);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1440, height: 900 });
      await openReport(page, id);
      const scan = async () => {
        await settle(page);
        const results = await new AxeBuilder({ page })
          .withTags(TAGS)
          .disableRules(["color-contrast-enhanced"])
          .analyze();
        expect(results.violations).toEqual([]);
      };
      await scan();
      await hit(page);
      await expect(
        page.getByRole("heading", { level: 2, name: /\d\.\d+/ }),
      ).toBeVisible();
      await scan();
      await openTable(page);
      await expect(
        page.getByRole("region", { name: "Findings table" }),
      ).toBeVisible();
      await scan();
    });
  }
}

type ApiFinding = {
  key: string;
  sc: string;
  severity: string;
  tier: string;
  bbox: { x: number; y: number; w: number; h: number } | null;
};

const area = (f: ApiFinding) => (f.bbox?.w ?? 0) * (f.bbox?.h ?? 0);
const readingOrder = (rows: ApiFinding[]) =>
  [...rows].sort(
    (a, b) =>
      (a.bbox?.y ?? 1e12) - (b.bbox?.y ?? 1e12) ||
      (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0) ||
      area(b) - area(a) ||
      a.key.localeCompare(b.key),
  );

test("keyboard: Tab to the canvas, arrow to the third box, Enter, then K and J", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  const rows: ApiFinding[] = await (
    await request.get(`/api/runs/${id}/findings?viewport=mobile`)
  ).json();
  const reading = readingOrder(rows.filter((f) => f.bbox)).map((f) => f.key);
  const order = readingOrder(rows).map((f) => f.key);

  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await expect(page).toHaveTitle(/^Report - /);
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    if (
      await page.evaluate(() =>
        document.activeElement?.hasAttribute("data-key"),
      )
    )
      break;
  }
  await expect(tabStop(page)).toBeFocused();
  expect(await tabStop(page).getAttribute("data-key")).toBe(reading[0]);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const third = page.locator("svg [role=button]:focus");
  const thirdKey = (await third.getAttribute("data-key")) ?? "";
  expect(thirdKey).toBe(reading[2]);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`f=${thirdKey}(&|$)`));
  await expect(third).toHaveAttribute("aria-pressed", "true");
  const detail = page.getByRole("complementary", { name: "Finding detail" });
  const index = order.indexOf(thirdKey);
  await expect(detail).toContainText(`${index + 1} of ${order.length}`);
  await expect(page.getByTestId("report-status")).toHaveText(
    /^Selected \d\.\d+(\.\d+)? .+\. Details shown\./,
  );

  await third.press("k");
  const expectedPrev = order[(index - 1 + order.length) % order.length];
  await expect(page).toHaveURL(new RegExp(`f=${expectedPrev}(&|$)`));
  await third.press("j");
  await expect(page).toHaveURL(new RegExp(`f=${thirdKey}(&|$)`));
});

test("filters, selection and view are restored from the URL on reload", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await page
    .getByRole("navigation", { name: "Criteria" })
    .getByRole("button", { name: /2\.4\.13/ })
    .click();
  await openTable(page);
  const row = page.locator("tr[data-key]").first();
  await row.getByRole("button").first().click();
  await expect(page).toHaveURL(/f=f\d+/);
  const url = page.url();
  expect(url).toContain("sc=2.4.13");
  expect(url).toContain("view=table");
  expect(url).toMatch(/f=f\d+/);
  const key = new URL(url).searchParams.get("f") ?? "";

  await page.reload();
  await expect(
    page.getByRole("region", { name: "Findings table" }),
  ).toBeVisible();
  await expect(page.locator(`tr[data-key=${key}]`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(page.locator(`tr[data-key=${key}] button`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Criteria" })
      .getByRole("button", { name: /2\.4\.13/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { level: 2, name: /2\.4\.13/ }),
  ).toBeVisible();
});

test("marking a finding as fixed shows Fix not verified and persists across a reload", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await hit(page);
  await page
    .getByRole("button", { name: "Mark as fixed", exact: true })
    .click();
  const notice = page.getByTestId("decision-notice");
  await expect(notice).toContainText("Fix not verified");
  await expect(status(page)).toHaveText(/^Marked as fixed\. Fix not verified/);
  await expect(
    page.getByRole("button", { name: "Mark as fixed", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reopen" })).toBeFocused();
  await page.reload();
  await expect(page.getByTestId("decision-notice")).toContainText(
    "Fix not verified",
  );
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(
    page.getByRole("button", { name: "Mark as fixed", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("decision-notice")).toHaveCount(0);
});

test("dismissing needs a reason from the menu and the reason is stored and shown", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await hit(page);
  await expect(page).toHaveURL(/f=f\d+/);
  const key = new URL(page.url()).searchParams.get("f") ?? "";
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  for (const reason of [
    "Tool error",
    "Decorative or not interactive",
    "Third-party content",
    "Large text",
    "Other",
  ])
    await expect(menu.getByRole("menuitem", { name: reason })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Tool error" }).click();
  await expect(page.getByTestId("decision-notice")).toContainText("Dismissed");
  await expect(page.getByTestId("decision-notice")).toContainText("Tool error");
  await expect(status(page)).toHaveText("Dismissed: Tool error.");
  type Stored = {
    key: string;
    status: string;
    decision: { reason: string | null };
  };
  const stored = async () =>
    (
      (await (
        await request.get(`/api/runs/${id}/findings?viewport=mobile`)
      ).json()) as Stored[]
    ).find((f) => f.key === key);
  await expect.poll(async () => (await stored())?.status).toBe("dismissed");
  expect((await stored())?.decision.reason).toBe("Tool error");
  await page.reload();
  await expect(page.getByTestId("decision-notice")).toContainText("Tool error");
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByTestId("decision-notice")).toHaveCount(0);
});

test("a failed save rolls the decision back and shows an alert, not a toast", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await hit(page);
  await page.route("**/api/findings/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, body: "{}" })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Mark as fixed", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "could not be saved" }),
  ).toContainText("The decision could not be saved");
  await expect(
    page.getByRole("button", { name: "Mark as fixed", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("decision-notice")).toHaveCount(0);
});

test("group by Element and Severity lists every finding as a selectable row", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  const rows: (ApiFinding & { element: string })[] = await (
    await request.get(`/api/runs/${id}/findings?viewport=mobile`)
  ).json();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  const rail = page.getByRole("navigation", { name: "Criteria" });
  const group = rail.getByRole("group", { name: "Group by" });
  await expect(
    group.getByRole("button", { name: "Criterion" }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const heading of [
    "Failed",
    "Needs review",
    "No issue found",
    "Could not decide",
  ])
    await expect(rail.getByRole("heading", { name: heading })).toBeVisible();

  await group.getByRole("button", { name: "Severity" }).click();
  await expect(group.getByRole("button", { name: "Severity" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(rail.locator("button[data-finding]")).toHaveCount(rows.length);
  const severities = new Set(
    rows.map((f) => (f.tier === "needs-review" ? "Needs review" : f.severity)),
  );
  for (const sev of severities)
    await expect(
      rail.getByRole("heading", { name: new RegExp(`^${sev}$`, "i") }),
    ).toBeVisible();

  await group.getByRole("button", { name: "Element" }).click();
  await expect(rail.locator("button[data-finding]")).toHaveCount(rows.length);
  const elements = new Set(rows.map((f) => f.element));
  await expect(rail.locator("h3")).toHaveCount(elements.size);

  const first = rail.locator("button[data-finding]").first();
  const key = (await first.getAttribute("data-finding")) ?? "";
  await first.click();
  await expect(page).toHaveURL(new RegExp(`f=${key}(&|$)`));
  await expect(first).toHaveAttribute("aria-pressed", "true");
});

test("the summary counts failures, review items and undecided criteria and compares with the previous audit", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const finished = async (runId: string) =>
    expect
      .poll(
        async () =>
          (await (await request.get(`/api/runs/${runId}`)).json()).status,
        { timeout: 120_000 },
      )
      .toBe("done");
  const first = await request.post("/api/runs", {
    data: { folder: FOLDERS.mobile },
  });
  await finished((await first.json()).run_id);
  const second = await request.post("/api/runs", {
    data: { folder: FOLDERS.mobile },
  });
  const id = (await second.json()).run_id as string;
  await finished(id);

  const findings: { tier: string; status: string }[] = await (
    await request.get(`/api/runs/${id}/findings?viewport=mobile`)
  ).json();
  const failures = findings.filter(
    (f) => f.tier === "automated" && f.status !== "dismissed",
  ).length;
  const review = findings.filter(
    (f) => f.tier === "needs-review" && f.status !== "dismissed",
  ).length;
  const delta: {
    previous_run_id: string | null;
    fixed: { viewport: string }[];
    new: { viewport: string }[];
    still_present: { viewport: string }[];
  } = await (await request.get(`/api/runs/${id}/delta`)).json();
  expect(delta.previous_run_id).not.toBeNull();
  const n = (rows: { viewport: string }[]) =>
    rows.filter((r) => r.viewport === "mobile").length;
  expect(n(delta.still_present)).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  const summary = page.getByRole("region", { name: "Summary" });
  const verdict = summary.getByTestId("verdict");
  await expect(verdict).toContainText(
    `${failures} failure${failures === 1 ? "" : "s"}`,
  );
  await expect(verdict).toContainText(
    review === 0
      ? "No findings need review"
      : `${review} finding${review === 1 ? " needs" : "s need"} review`,
  );
  await expect(verdict).toContainText(/criteri(on|a) could not be decided/);
  await expect(
    summary.getByRole("img", { name: /criteria decided/ }),
  ).toBeVisible();
  await expect(summary.getByTestId("since-last")).toHaveText(
    new RegExp(
      `^${n(delta.fixed)} fixed · ${n(delta.new)} new · ${n(delta.still_present)} still present`,
    ),
  );
  await expect(
    summary.getByText(
      "This tool checks 8 of the 86 WCAG 2.2 success criteria.",
    ),
  ).toBeVisible();
  await expect(
    summary.getByRole("link", { name: "What this result does not mean" }),
  ).toHaveAttribute("href", "/help");
});

test("the view tabs link to the table, compare and coverage views and keep the URL state", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id, "?sc=2.4.13");
  const tabs = page.getByRole("navigation", { name: "Report views" });
  await expect(tabs.getByRole("link", { name: "Findings" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("link", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(/view=table/);
  expect(page.url()).toContain("sc=2.4.13");
  await tabs.getByRole("link", { name: "Findings" }).click();
  await expect(page).not.toHaveURL(/view=table/);
  await expect(
    tabs.getByRole("link", { name: "Compare with rules only" }),
  ).toHaveAttribute("href", new RegExp(`/runs/${id}/compare`));
  await expect(tabs.getByRole("link", { name: "Coverage" })).toHaveAttribute(
    "href",
    new RegExp(`/runs/${id}/coverage`),
  );
  await tabs.getByRole("link", { name: "Coverage" }).click();
  await expect(page).toHaveURL(/\/coverage/);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the redesigned report has zero axe violations at 390 px (${scheme})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const id = await ensureRun(request, "mobile");
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await openReport(page, id);
    const scan = async () => {
      await settle(page);
      const results = await new AxeBuilder({ page })
        .withTags(TAGS)
        .disableRules(["color-contrast-enhanced"])
        .analyze();
      expect(results.violations).toEqual([]);
    };
    await scan();
    await page.getByRole("tab", { name: "Criteria" }).click();
    await scan();
    await page
      .getByRole("navigation", { name: "Criteria" })
      .getByRole("group", { name: "Group by" })
      .getByRole("button", { name: "Severity" })
      .click();
    await scan();
    await page.getByRole("tab", { name: "Canvas" }).click();
    await hit(page);
    await expect(
      page.getByRole("tabpanel", { name: "Detail" }).getByRole("heading", {
        level: 2,
      }),
    ).toBeVisible();
    await scan();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test(`group-by, decided and dropdown states have zero axe violations at 1440 px (${scheme})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const id = await ensureRun(request, "mobile");
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReport(page, id);
    const scan = async () => {
      await settle(page);
      const results = await new AxeBuilder({ page })
        .withTags(TAGS)
        .disableRules(["color-contrast-enhanced"])
        .analyze();
      expect(results.violations).toEqual([]);
    };
    const group = page
      .getByRole("navigation", { name: "Criteria" })
      .getByRole("group", { name: "Group by" });
    for (const by of ["Element", "Severity", "Criterion"]) {
      await group.getByRole("button", { name: by }).click();
      await scan();
    }
    await hit(page);
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await scan();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Mark as fixed", exact: true })
      .click();
    await expect(page.getByTestId("decision-notice")).toBeVisible();
    await scan();
    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByTestId("decision-notice")).toHaveCount(0);
  });
}

test("a focus finding offers the Focused, Unfocused and Diff views", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id, "?sc=2.4.11");
  await hit(page);
  await page.getByRole("button", { name: "Diff", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Pixels that changed/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Focused", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /with keyboard focus/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Page view", exact: true }).click();
  await expect(boxes(page).first()).toBeVisible();
});

test("the layout collapses to a sheet under 1280 px and to tabs under 1024 px", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1100, height: 800 });
  await openReport(page, id);
  await hit(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.setViewportSize({ width: 800, height: 800 });
  await expect(page.getByRole("tab", { name: "Criteria" })).toBeVisible();
  await page.getByRole("tab", { name: "Detail" }).click();
  await expect(page.getByRole("tabpanel", { name: "Detail" })).toBeVisible();
});

test("report at 1440x900 matches the committed snapshot", async ({
  page,
  request,
}) => {
  test.skip(
    process.platform !== "darwin",
    "snapshot baseline is recorded on macOS",
  );
  const id = await ensureRun(request, "mobile");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await page.evaluate(() => document.fonts.ready);
  let previous = "";
  await expect
    .poll(
      async () => {
        const box = await page.getByTestId("canvas").boundingBox();
        const now = `${box?.width}x${box?.height}`;
        const same = now === previous;
        previous = now;
        return same;
      },
      { intervals: [400], timeout: 10_000 },
    )
    .toBe(true);
  await settle(page);
  await expect(page).toHaveScreenshot("report-1440x900.png", {
    maxDiffPixelRatio: 0.01,
    mask: [
      page.getByRole("complementary", { name: "Sidebar" }),
      page.locator("time"),
      page.getByTestId("since-last"),
    ],
  });
});

test("axe passes in the sheet, tab, diff, filtered and empty layouts", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const id = await ensureRun(request, "mobile");
  const scan = async (include?: string) => {
    await settle(page);
    const builder = new AxeBuilder({ page })
      .withTags(TAGS)
      .disableRules(["color-contrast-enhanced"]);
    if (include) builder.include(include);
    expect((await builder.analyze()).violations).toEqual([]);
  };

  await page.setViewportSize({ width: 1100, height: 800 });
  await openReport(page, id);
  await hit(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await scan("[role=dialog]");
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 800, height: 800 });
  await page.getByRole("tab", { name: "Detail" }).click();
  await scan();
  await page.getByRole("tab", { name: "Criteria" }).click();
  await scan();

  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id, "?sc=2.4.11");
  await hit(page);
  await page.getByRole("button", { name: "Diff", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Pixels that changed/ }),
  ).toBeVisible();
  await scan();

  await page.goto(`/runs/${id}?q=zzzz-no-match&view=table`);
  await expect(
    page.getByRole("region", { name: "Findings table" }),
  ).toBeVisible();
  await expect(
    page.getByText("No findings match the current filters."),
  ).toBeVisible();
  await scan();
});

test("severity, provenance, search and viewport filters come back from the URL", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id, "?vp=mobile&sev=serious&prov=rule&q=tiny");
  const rows: {
    severity: string;
    provenance: string;
    element: string;
    tier: string;
  }[] = await (
    await request.get(`/api/runs/${id}/findings?viewport=mobile`)
  ).json();
  const expected = rows.filter(
    (f) =>
      f.tier !== "needs-review" &&
      f.severity === "serious" &&
      f.provenance === "rule" &&
      `${f.element}`.toLowerCase().includes("tiny"),
  ).length;
  await expect(boxes(page)).toHaveCount(expected);
  await expect(
    page.getByRole("searchbox", { name: "Search findings" }),
  ).toHaveValue("tiny");
  await openTable(page);
  await page
    .getByRole("button", { name: /^Filter by severity, \d selected/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Filter by severity" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Serious/ })).toBeChecked();
});

test("the table view shows no literal source text and a no-match note only when empty", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id, "?view=table");
  const region = page.getByRole("region", { name: "Findings table" });
  await expect(region).toBeVisible();
  await expect(region).not.toContainText("items.length");
  await expect(
    page.getByText("No findings match the current filters."),
  ).toHaveCount(0);
  await expect(page).toHaveTitle(/^Report - /);
});

test("announcements: selection, clearing, filtering and copying go to one persistent status region", async ({
  page,
  request,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await expect(status(page)).toHaveCount(1);
  await expect(status(page)).toHaveAttribute("role", "status");
  await expect(status(page)).toBeEmpty();

  await tabStop(page).focus();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    /^Selected \d\.\d+(?:\.\d+)? .+, (Critical|Serious|Minor|Needs review)\. Details shown\. \d+ of \d+\./,
  );
  await page.keyboard.press("Escape");
  await expect(status(page)).toHaveText("Selection cleared");

  await page
    .getByRole("navigation", { name: "Criteria" })
    .getByRole("button", { name: /2\.4\.11/ })
    .click();
  await expect(status(page)).toHaveText(/^Showing \d+ findings?$/);
  await openTable(page);
  await page
    .getByRole("navigation", { name: "Criteria" })
    .getByRole("button", { name: "All criteria" })
    .click();
  await expect(status(page)).toHaveText(/^Showing \d+ findings?$/);

  const copy = page.getByRole("button", { name: /^Copy (HTML|CSS)$/ });
  const rows = page.locator("tr[data-key] button");
  const total = await rows.count();
  for (let i = 0; i < total && (await copy.count()) === 0; i += 1)
    await rows.nth(i).click();
  await copy.first().click();
  await expect(status(page)).toHaveText(/^(HTML|CSS) copied$/);
});

test("j and k only act from inside the findings workspace", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await page.locator("body").press("j");
  await page.getByRole("link", { name: "Table", exact: true }).press("j");
  await expect(page).not.toHaveURL(/f=/);
  await tabStop(page).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/f=/);
  await expect(
    page.getByRole("button", { name: "Next finding" }),
  ).toHaveAttribute("aria-keyshortcuts", "J");
  await expect(
    page.getByRole("button", { name: "Previous finding" }),
  ).toHaveAttribute("aria-keyshortcuts", "K");
});

test("focus returns to the originating finding from the sheet and the Detail tab", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1100, height: 800 });
  await openReport(page, id);
  const box = tabStop(page);
  const key = (await box.getAttribute("data-key")) ?? "";
  await box.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(dialog.getByRole("complementary")).toHaveCount(0);
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest("[role=dialog]"),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.locator(`svg [role=button][data-key=${key}]`),
  ).toBeFocused();

  await page.setViewportSize({ width: 800, height: 800 });
  await expect(page.getByRole("tab", { name: "Detail" })).toBeVisible();
  const small = tabStop(page);
  const smallKey = (await small.getAttribute("data-key")) ?? "";
  await small.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("tabpanel", { name: "Detail" }).getByRole("heading", {
      level: 2,
    }),
  ).toBeFocused();
  const back = page.getByRole("button", { name: "Back to findings" });
  const size = await back.boundingBox();
  expect(size?.height).toBeGreaterThanOrEqual(24);
  await back.click();
  await expect(
    page.locator(`svg [role=button][data-key=${smallKey}]`),
  ).toBeFocused();
});

test("skip to findings table moves focus to the table region", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await page.getByRole("button", { name: "Skip to findings table" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Findings table" }),
  ).toBeFocused();
});

test("F moves focus into the focus pair view and back to the box", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id, "?sc=2.4.13");
  const box = tabStop(page);
  const key = (await box.getAttribute("data-key")) ?? "";
  await box.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/f=/);
  await page.keyboard.press("f");
  await expect(
    page.getByRole("region", { name: /Focus pair view/ }),
  ).toBeFocused();
  await page.keyboard.press("f");
  await expect(
    page.locator(`svg [role=button][data-key=${key}]`),
  ).toBeFocused();
});

test("the canvas pans with Shift+Arrow from the frame and from a toolbar button", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  const transform = () =>
    page
      .locator("[data-testid=canvas] .react-transform-component")
      .evaluate((el) => (el as HTMLElement).style.transform);
  await page.getByTestId("canvas").focus();
  const before = await transform();
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(transform).not.toBe(before);
  const mid = await transform();
  await page.getByRole("button", { name: "Zoom in" }).focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(transform).not.toBe(mid);
});

test("names and roles: unique box names, no selector or None:1, distinct filter and sort buttons", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  const names = await boxes(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );
  expect(new Set(names).size).toBe(names.length);
  for (const [i, name] of names.entries()) {
    expect(name).toMatch(new RegExp(`, ${i + 1} of ${names.length}$`));
    expect(name).not.toContain("None:1");
    expect(name.length).toBeLessThan(110);
  }
  const keys = await boxes(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-key")),
  );
  const rows: ApiFinding[] = await (
    await request.get(`/api/runs/${id}/findings?viewport=mobile`)
  ).json();
  expect(keys).toEqual(
    readingOrder(rows.filter((f) => f.bbox)).map((f) => f.key),
  );

  await page
    .getByRole("navigation", { name: "Criteria" })
    .getByRole("button", { name: "All criteria" })
    .click();
  await openTable(page);
  await expect(
    page
      .getByRole("navigation", { name: "Report views" })
      .getByRole("link", { name: "Table", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page
      .getByRole("button", { name: /^Select \d\.\d+(?:\.\d+)? .+, .+, .+/ })
      .first(),
  ).toBeVisible();
  await expect(page.locator("tr[aria-selected]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Sort by severity/ }),
  ).toBeVisible();
  const trigger = page.getByRole("button", { name: /^Filter by severity/ });
  await expect(trigger).toBeVisible();
  const box = await page
    .getByRole("button", { name: /^Sort by severity/ })
    .boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(24);
  await trigger.click();
  await settle(page);
  const check = await page.getByRole("checkbox").first().boundingBox();
  expect(check?.width).toBeGreaterThanOrEqual(24);
  expect(check?.height).toBeGreaterThanOrEqual(24);
});

test("J and K are ignored when single-key shortcuts are off, and a fixed finding stays marked in the rail", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "wcag-auditor.settings",
      JSON.stringify({ shortcuts: false }),
    ),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await tabStop(page).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/f=/);
  const url = page.url();
  await page.keyboard.press("j");
  await page.keyboard.press("k");
  expect(page.url()).toBe(url);
  await expect(
    page.getByRole("button", { name: "Next finding" }),
  ).not.toHaveAttribute("aria-keyshortcuts", "J");
  await page
    .getByRole("button", { name: "Mark as fixed", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Criteria" })
      .getByText("Fix not verified")
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByTestId("decision-notice")).toHaveCount(0);
});

test("with a finding selected the sidebar stays at the viewport bottom after scrolling to the end", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await boxes(page).first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/f=f\d+/);
  await page.evaluate(() =>
    window.scrollTo(0, document.scrollingElement?.scrollHeight ?? 0),
  );
  const geometry = await page.evaluate(() => {
    const root = document.scrollingElement as HTMLElement;
    const shell = document.querySelector("aside")?.parentElement as HTMLElement;
    const aside = document.querySelector("aside") as HTMLElement;
    return {
      scrollHeight: root.scrollHeight,
      shellBottom: shell.getBoundingClientRect().bottom + window.scrollY,
      innerHeight: window.innerHeight,
      asideBottom: aside.getBoundingClientRect().bottom,
    };
  });
  expect(Math.round(geometry.asideBottom)).toBe(geometry.innerHeight);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(
    Math.ceil(geometry.shellBottom) + 1,
  );
});

test("group by is kept in the URL and survives a reload, and a criterion link keeps the viewport", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  const rail = page.getByRole("navigation", { name: "Criteria" });
  const group = rail.getByRole("group", { name: "Group by" });
  await group.getByRole("button", { name: "Severity" }).click();
  await expect(page).toHaveURL(/group=severity/);
  await page.reload();
  await expect(group.getByRole("button", { name: "Severity" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await group.getByRole("button", { name: "Criterion" }).click();
  await expect(page).not.toHaveURL(/group=/);
  await rail.getByRole("button", { name: /2\.4\.13/ }).click();
  await expect(page).toHaveURL(/sc=2\.4\.13/);
  await expect(page).toHaveURL(/vp=mobile/);
});
