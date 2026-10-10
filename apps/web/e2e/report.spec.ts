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

test("keyboard: Tab to the canvas, arrow to the third box, Enter, then K and J", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReport(page, id);
  const total = await boxes(page).count();
  expect(total).toBeGreaterThan(3);

  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    if (
      await page.evaluate(() =>
        document.activeElement?.hasAttribute("data-key"),
      )
    )
      break;
  }
  const first = await tabStop(page).getAttribute("data-key");
  await expect(tabStop(page)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const third = page.locator("svg [role=button]:focus");
  const thirdKey = await third.getAttribute("data-key");
  expect(thirdKey).not.toBe(first);
  const label = (await third.getAttribute("aria-label")) ?? "";
  const key = (await third.getAttribute("data-key")) ?? "";
  await page.keyboard.press("Enter");

  const heading = page.getByRole("heading", {
    level: 2,
    name: new RegExp(`^.*${label.split(" ")[0].replace(".", "\\.")}`),
  });
  await expect(heading).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`f=${key}`));
  await expect(third).toHaveAttribute("aria-pressed", "true");

  await page.locator("body").press("k");
  await expect(page).not.toHaveURL(new RegExp(`f=${key}(&|$)`));
  const previous = new URL(page.url()).searchParams.get("f");
  expect(previous).not.toBeNull();
  await page.locator("body").press("j");
  await expect(page).toHaveURL(new RegExp(`f=${key}(&|$)`));
  await page.keyboard.press("Escape");
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
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot("report-1440x900.png", {
    maxDiffPixelRatio: 0.02,
    mask: [page.getByText(/ago$|just now/)],
  });
});
