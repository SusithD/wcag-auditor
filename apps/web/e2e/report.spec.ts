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
  await expect(
    page.getByRole("img", { name: /Full-page screenshot/ }),
  ).toBeVisible();
}

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
      await page.getByRole("button", { name: "Table", exact: true }).click();
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
  bbox: { x: number; y: number } | null;
};

const SC_ORDER = [
  "1.4.3",
  "1.4.11",
  "2.4.7",
  "2.4.11",
  "2.4.12",
  "2.4.13",
  "2.5.7",
  "2.5.8",
];
const SEV_RANK: Record<string, number> = {
  critical: 0,
  serious: 1,
  minor: 2,
  "needs-review": 3,
};

const readingOrder = (rows: ApiFinding[]) =>
  [...rows].sort(
    (a, b) =>
      (a.bbox?.y ?? 1e12) - (b.bbox?.y ?? 1e12) ||
      (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0) ||
      a.key.localeCompare(b.key),
  );
const tableOrder = (rows: ApiFinding[]) =>
  [...rows].sort(
    (a, b) =>
      SC_ORDER.indexOf(a.sc) - SC_ORDER.indexOf(b.sc) ||
      SEV_RANK[a.tier === "needs-review" ? "needs-review" : a.severity] -
        SEV_RANK[b.tier === "needs-review" ? "needs-review" : b.severity] ||
      (a.bbox?.y ?? 0) - (b.bbox?.y ?? 0) ||
      (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0) ||
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
  const table = tableOrder(rows).map((f) => f.key);
  expect(reading.slice(0, 3)).not.toEqual(table.slice(0, 3));

  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
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
  const tableIndex = table.indexOf(thirdKey);
  await expect(detail).toContainText(`${tableIndex + 1} of ${table.length}`);

  await page.locator("body").press("k");
  const expectedPrev = table[(tableIndex - 1 + table.length) % table.length];
  await expect(page).toHaveURL(new RegExp(`f=${expectedPrev}(&|$)`));
  await page.locator("body").press("j");
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
  await page.getByRole("button", { name: "Table", exact: true }).click();
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
    "aria-selected",
    "true",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Criteria" })
      .getByRole("button", { name: /2\.4\.13/ }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { level: 2, name: /2\.4\.13/ }),
  ).toBeVisible();
});

test("status changes persist across a reload", async ({ page, request }) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  await hit(page);
  await page.getByRole("button", { name: "Mark fixed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fixed", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Fixed", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fixed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark fixed", exact: true }),
  ).toBeVisible();
});

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
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByRole("button", { name: /^Severity \(\d\)/ }).click();
  await expect(page.getByRole("checkbox", { name: /Serious/ })).toBeChecked();
});
