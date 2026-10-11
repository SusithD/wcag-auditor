import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

const FOLDER = resolve(
  __dirname,
  "../../../fixtures/real/real_com_011_mobile_20261004T054738Z",
);
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

let runId: string | undefined;

async function ensureRun(request: APIRequestContext) {
  if (runId) return runId;
  const created = await request.post("/api/runs", { data: { folder: FOLDER } });
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
  runId = run_id as string;
  return runId;
}

const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );

async function scan(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast-enhanced"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function showTables(page: Page) {
  for (const group of await page.getByRole("group", { name: / view$/ }).all()) {
    await group.getByRole("button", { name: "Table" }).click();
  }
}

test.describe.configure({ mode: "serial" });

for (const scheme of ["light", "dark"] as const) {
  test(`coverage has zero axe violations (${scheme})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const id = await ensureRun(request);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/runs/${id}/coverage`);
    await expect(
      page.getByRole("heading", { level: 2, name: "Coverage" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByText("1.4.3 Contrast (Minimum)").last().click();
    await scan(page);
  });

  test(`compare has zero axe violations (${scheme})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const id = await ensureRun(request);
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`/runs/${id}/compare`);
    await expect(
      page
        .getByRole("navigation", { name: "Run views" })
        .getByRole("link", { name: "Compare with rules only" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("img", { name: /Hybrid: Full-page screenshot/ }),
    ).toBeVisible();
    await scan(page);
  });

  test(`evaluation has zero axe violations in chart and table views (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/eval");
    await expect(
      page.getByRole("img", { name: /^Recall by criterion/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /^Difference in precision/ }),
    ).toBeVisible();
    await scan(page);
    await showTables(page);
    await expect(
      page.getByRole("table", { name: /Recall by criterion/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: /Per-criterion results/ }),
    ).toBeVisible();
    await scan(page);
  });
}

test("coverage shows eight criteria, the reliable count per channel and the catalogue", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request);
  await page.goto(`/runs/${id}/coverage`);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(
    page
      .getByRole("navigation", { name: "Run views" })
      .getByRole("link", { name: "Coverage" }),
  ).toHaveAttribute("aria-current", "page");
  const grid = page.getByRole("region", {
    name: /Which channel returned a verdict/,
  });
  await expect(grid.getByRole("row")).toHaveCount(1 + 8 + 1);
  await expect(grid.getByText("SCs with a reliable verdict")).toBeVisible();
  await expect(
    grid.getByRole("cell", { name: /4 \/ 8 automated/ }),
  ).toBeVisible();
  await expect(page.getByText("Decision procedure").first()).toBeHidden();
  await page.getByText("1.4.3 Contrast (Minimum)").last().click();
  await expect(page.getByText("Decision procedure").first()).toBeVisible();

  const main = page.locator("main");
  await expect(main).not.toContainText("**");
  await expect(main).not.toContainText("RQ3");
  await expect(main).not.toContainText("(+DOM)");
  await expect(main).not.toContainText("needs-review");
  await expect(main.locator("p strong").first()).toHaveText(/\d of 8/);
  await expect(grid.getByRole("cell").first()).toContainText(/\d+ findings?/);
  await expect(grid.locator("caption")).toHaveCount(0);
});

test("focus moves to the page heading after in-page navigation", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/runs/${id}/coverage`);
  await page
    .getByRole("navigation", { name: "Run views" })
    .getByRole("link", { name: "Compare" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(
    page
      .getByRole("navigation", { name: "Run views" })
      .getByRole("link", { name: "Compare with rules only" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("group", { name: "Hybrid report" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Rule-only report" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Item 1 of \d+/ }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Run views" })
    .getByRole("link", { name: "Coverage" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(
    page
      .getByRole("navigation", { name: "Run views" })
      .getByRole("link", { name: "Coverage" }),
  ).toHaveAttribute("aria-current", "page");
});

test("compare keeps the two canvases and selection in step", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/runs/${id}/compare`);
  const left = page.getByRole("region", { name: /Hybrid/ });
  const right = page.getByRole("region", { name: /Rule-only/ });
  await expect(
    left.getByRole("img", { name: /Full-page screenshot/ }),
  ).toBeVisible();

  const styleOf = (pane: typeof left) =>
    pane.locator(".react-transform-component").getAttribute("style");
  const initial = await styleOf(left);
  await left.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(async () => {
      const a = await styleOf(left);
      const b = await styleOf(right);
      return a !== initial && a === b;
    })
    .toBe(true);
  const afterLeft = await styleOf(left);
  await right.getByRole("button", { name: "Zoom out" }).click();
  await expect
    .poll(async () => {
      const a = await styleOf(left);
      const b = await styleOf(right);
      return a !== afterLeft && a === b;
    })
    .toBe(true);

  const hybridBoxes = await left.locator("svg [role=button][data-key]").count();
  const ruleBoxes = await right.locator("svg [role=button][data-key]").count();
  expect(hybridBoxes).toBeGreaterThan(ruleBoxes);

  const onlyButtons = page.getByRole("button", { name: /Only in hybrid/ });
  expect(await onlyButtons.count()).toBeGreaterThanOrEqual(1);
  const only = onlyButtons.first();
  await only.click();
  await expect(only).toHaveAttribute("aria-pressed", "true");
  await expect(
    left.locator("svg [role=button][aria-pressed=true]"),
  ).toHaveCount(1);
});

test("the report links to coverage and compare", async ({ page, request }) => {
  const id = await ensureRun(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/runs/${id}`);
  await page
    .getByRole("navigation", { name: /^(Run|Report) views$/ })
    .getByRole("link", { name: "Coverage" })
    .click();
  await expect(page).toHaveURL(/\/coverage/);
  await page
    .getByRole("navigation", { name: /^(Run|Report) views$/ })
    .getByRole("link", { name: "Compare" })
    .click();
  await expect(page).toHaveURL(/\/compare/);
});

test("report export files download and open", async ({ page, request }) => {
  const id = await ensureRun(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/runs/${id}`);
  const expected: Record<string, RegExp> = {
    JSON: /"findings"/,
    HTML: /^<!doctype html>/i,
    CSV: /^id,sc,severity/,
  };
  for (const [name, pattern] of Object.entries(expected)) {
    await page.getByRole("button", { name: "Export" }).click();
    await expect(
      page.getByRole("menuitem", { name: new RegExp(name) }),
    ).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: new RegExp(name) }).click(),
    ]);
    const path = await download.path();
    expect(readFileSync(path, "utf-8")).toMatch(pattern);
  }
});

test("the evaluation page renders the committed results and exports them", async ({
  page,
}) => {
  await page.goto("/eval");
  await expect(
    page.getByRole("heading", { level: 1, name: "Evaluation" }),
  ).toBeVisible();
  const chart = page.getByRole("img", { name: /^Recall by criterion/ });
  await expect(chart).toHaveAttribute("aria-label", /on the real stratum/);
  await page
    .getByRole("group", { name: "Page set" })
    .getByRole("button", { name: "Synthetic" })
    .click();
  await expect(chart).toHaveAttribute("aria-label", /on the synthetic stratum/);

  await page
    .getByRole("group", { name: /^Recall by criterion.* view$/ })
    .getByRole("button", { name: "Table" })
    .click();
  const recall = page.getByRole("table", { name: /Recall by criterion/ });
  await expect(recall.getByRole("row")).toHaveCount(9);
  const table = page.getByRole("table", { name: /Per-criterion results/ });
  await expect(table.getByRole("row")).toHaveCount(9);
  await expect(page.getByRole("table", { name: /McNemar/ })).toBeVisible();
  await expect(page.getByText(/hybrid against rule_only/)).toBeVisible();

  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  expect(readFileSync(await csv.path(), "utf-8")).toMatch(
    /^sc,tp,fp,fn,duplicates,precision/,
  );
  const [tex] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export LaTeX" }).click(),
  ]);
  expect(readFileSync(await tex.path(), "utf-8")).toContain("\\begin{tabular}");
});

test("an evaluation can be started and its progress followed to the end", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto("/eval");
  await expect(page.locator("#eval-pick")).toBeVisible();
  const before = await page.locator("#eval-pick option").count();
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(
    page.getByRole("button", { name: "Evaluation running" }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Evaluation progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run evaluation" }),
  ).toBeVisible({
    timeout: 280_000,
  });
  await expect(page.locator("#eval-pick option")).toHaveCount(before + 1);
  await expect(
    page.getByRole("img", { name: /^Recall by criterion/ }),
  ).toBeVisible();
});

const failedEval = {
  id: 99,
  created_at: "2026-10-10T12:00:00Z",
  status: "failed",
  source: "run",
  conditions: ["hybrid"],
  error: "The evaluation failed: exit code 1",
  done: null,
  total: null,
};

for (const scheme of ["light", "dark"] as const) {
  test(`evaluation empty, running and failed states have zero axe violations (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const states: [string, object[]][] = [
      ["empty", []],
      [
        "running",
        [{ ...failedEval, status: "running", error: null, done: 4, total: 12 }],
      ],
      ["failed", [failedEval]],
    ];
    for (const [name, list] of states) {
      await page.route("**/api/eval", (r) => r.fulfill({ json: list }), {
        times: 5,
      });
      await page.route("**/api/eval/99", (r) =>
        r.fulfill({ json: { summary: list[0], view: null } }),
      );
      await page.route("**/api/eval/99/events", (r) =>
        r.fulfill({ contentType: "text/event-stream", body: "" }),
      );
      await page.goto("/eval");
      await expect(
        page.getByRole("heading", { level: 1, name: "Evaluation" }),
      ).toBeVisible();
      if (name === "running")
        await expect(page.getByRole("progressbar")).toBeVisible();
      if (name === "failed")
        await expect(page.getByText(/This evaluation failed/)).toBeVisible();
      if (name === "empty")
        await expect(
          page.getByText(/No evaluation has been run/),
        ).toBeVisible();
      await scan(page);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });
}

test("compare explains itself for a rule-only run and coverage scans before expansion", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const created = await request.post("/api/runs", {
    data: { folder: FOLDER, condition: "rule_only" },
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
  await page.goto(`/runs/${run_id}/compare`);
  await expect(
    page.getByRole("heading", {
      name: "Compare is not available for this run",
    }),
  ).toBeVisible();
  await scan(page);
  const id = await ensureRun(request);
  await page.goto(`/runs/${id}/coverage`);
  await expect(page.getByRole("table")).toBeVisible();
  await scan(page);
});

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;

for (const scheme of ["light", "dark"] as const) {
  for (const size of SIZES) {
    test(`coverage, compare and evaluation scan clean at ${size.name} px (${scheme})`, async ({
      page,
      request,
    }) => {
      test.setTimeout(150_000);
      const id = await ensureRun(request);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: size.width, height: size.height });

      await page.goto(`/runs/${id}/coverage`);
      await expect(page.getByRole("table")).toBeVisible();
      await page.getByText("1.4.3 Contrast (Minimum)").last().click();
      await scan(page);

      await page.goto(`/runs/${id}/compare`);
      await expect(
        page.getByRole("img", { name: /Hybrid: Full-page screenshot/ }),
      ).toBeVisible();
      await scan(page);

      await page.goto("/eval");
      await expect(
        page.getByRole("img", { name: /^Recall by criterion/ }),
      ).toBeVisible();
      await scan(page);
      await showTables(page);
      await scan(page);
    });
  }
}

test("coverage and evaluation reflow at 320 px without page scroll", async ({
  page,
  request,
}) => {
  const id = await ensureRun(request);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of [`/runs/${id}/coverage`, "/eval"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
