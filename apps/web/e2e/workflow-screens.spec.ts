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
  decision: Record<string, unknown>;
};

function finding(row: Row) {
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
    decision: row.decision,
    needs_review_reason: row.reason,
  };
}

function seed(): Row[] {
  const open = { status: "open" };
  return [
    {
      id: 1,
      sc: "1.4.3",
      reason: REASON_A,
      site: "marlowegreen.example/about",
      status: "open",
      decision: open,
    },
    {
      id: 2,
      sc: "1.4.3",
      reason: REASON_A,
      site: "kettleandcrumb.example",
      status: "open",
      decision: open,
    },
    {
      id: 3,
      sc: "1.4.11",
      reason: REASON_B,
      site: "fernlea-health.example",
      status: "open",
      decision: open,
    },
  ];
}

async function mockReview(page: Page, rows: Row[] = seed()) {
  await page.route(/\/api\/review(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const state = url.searchParams.get("state") ?? "waiting";
    const waiting = new Set(["open", "unsure"]);
    const decided = new Set(["confirmed", "dismissed"]);
    const picked = rows.filter((r) =>
      state === "all"
        ? true
        : state === "waiting"
          ? waiting.has(r.status)
          : decided.has(r.status),
    );
    const counts = new Map<string, number>();
    for (const r of picked)
      counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    await route.fulfill({
      json: {
        items: picked.map((r) => ({
          finding: finding(r),
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
  await page.route(/\/api\/findings\/\d+$/, async (route) => {
    const id = Number(route.request().url().split("/").pop());
    const body = route.request().postDataJSON() as {
      status: string;
      reason?: string;
      note?: string;
    };
    const row = rows.find((r) => r.id === id);
    if (!row) return route.fulfill({ status: 404, json: {} });
    row.status = body.status;
    row.decision =
      body.status === "open"
        ? { status: "open" }
        : {
            status: body.status,
            reason: body.reason ?? null,
            note: body.note ?? null,
            decided_at: new Date().toISOString(),
            decided_by: "Local user",
          };
    await route.fulfill({ json: finding(row) });
  });
}

const RUN = (id: string, status: string, source: string, vps: string[]) => ({
  id: id.repeat(32).slice(0, 32),
  created_at: "2026-10-10T12:00:00Z",
  source_kind: "url",
  source,
  viewports: vps,
  condition: "hybrid",
  status,
  stage_status: {},
  error: null,
  counts: { critical: 1, serious: 2, minor: 3, needs_review: 4 },
  available_viewports: vps,
});

const RUNS = [
  RUN("a", "done", "https://marlowegreen.example/about", ["desktop"]),
  RUN("b", "failed", "https://kettleandcrumb.example", ["mobile"]),
  RUN("c", "done", "https://fernlea-health.example", ["desktop", "mobile"]),
];

async function mockLists(page: Page) {
  await page.route(/\/api\/runs(\?.*)?$/, (route) =>
    route.fulfill({ json: RUNS }),
  );
  await page.route(/\/api\/sites$/, (route) =>
    route.fulfill({
      json: RUNS.map((run, i) => ({
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

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast-enhanced"])
    .analyze();
  expect(
    results.violations.map((v) => `${label}: ${v.id} ${v.nodes[0]?.html}`),
  ).toEqual([]);
}

test.describe("review queue", () => {
  test("the decision controls are visible without scrolling at 1440 x 900", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockReview(page);
    await page.goto("/review");
    const group = page.getByRole("radiogroup", { name: "Your decision" });
    const last = page.getByRole("radio", { name: /Could not decide/ });
    await expect(last).toBeAttached();
    const box = await group.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
  });

  test("groups by reason and shows the selected finding", async ({ page }) => {
    await mockReview(page);
    await page.goto("/review");
    await expect(
      page.getByRole("heading", { level: 1, name: "Review queue" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Text size and weight unknown/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: /Element box estimated by the detector/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Text size and weight unknown. Large-text status"),
    ).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: "Your decision" }),
    ).toBeVisible();
  });

  test("saves a decision, moves on, focuses the detail and can undo", async ({
    page,
  }) => {
    await mockReview(page);
    await page.goto("/review");
    await page.getByRole("radio", { name: /Confirm issue/ }).check();
    await page.getByLabel(/^Note/).fill("Checked in the inspector");
    await page.getByRole("button", { name: "Save and next" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Saved: Confirmed for 1.4.3 on marlowegreen.example/about",
    );
    await expect(page.getByRole("status")).toContainText("2 waiting");
    await expect(
      page.getByRole("heading", { level: 2, name: /Contrast \(Minimum\)/ }),
    ).toBeFocused();
    const recent = page.locator("section[aria-labelledby=recent-decided-h]");
    await expect(recent).toContainText("Confirmed");
    await recent.getByRole("button", { name: /^Undo decision/ }).click();
    await expect(page.getByRole("status")).toContainText("Decision undone");
    await expect(recent).not.toContainText("Confirmed");
  });

  test("dismissing needs a reason and says so without a toast", async ({
    page,
  }) => {
    await mockReview(page);
    await page.goto("/review");
    await page.getByRole("radio", { name: /Dismiss/ }).check();
    await page.getByRole("button", { name: "Save and next" }).click();
    await expect(page.locator("#review-error")).toContainText(
      "Choose a reason for dismissing",
    );
    await expect(
      page
        .getByRole("group", { name: "Choose a reason for dismissing" })
        .getByRole("button")
        .first(),
    ).toBeFocused();
    await page.getByRole("button", { name: "Decorative" }).click();
    await page.getByRole("button", { name: "Save and next" }).click();
    await expect(page.getByRole("status")).toContainText("Saved: Dismissed");
  });

  test("single-key shortcuts move, decide and stay quiet while typing", async ({
    page,
  }) => {
    await mockReview(page);
    await page.goto("/review");
    const second = page
      .getByRole("button", { name: /Contrast \(Minimum\)/ })
      .nth(1);
    await expect(second).toBeVisible();
    await page.keyboard.press("j");
    await expect(second).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("k");
    await expect(
      page.getByRole("button", { name: /Contrast \(Minimum\)/ }).first(),
    ).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("x");
    await expect(page.getByRole("radio", { name: /Dismiss/ })).toBeChecked();
    await page.keyboard.press("c");
    await expect(
      page.getByRole("radio", { name: /Confirm issue/ }),
    ).toBeChecked();
    await page.keyboard.press("u");
    await expect(
      page.getByRole("radio", { name: /Could not decide/ }),
    ).toBeChecked();
    await page.getByLabel(/^Note/).click();
    await page.keyboard.type("jxc");
    await expect(page.getByLabel(/^Note/)).toHaveValue("jxc");
    await expect(
      page.getByRole("radio", { name: /Could not decide/ }),
    ).toBeChecked();
  });

  test("shortcuts can be turned off in settings", async ({ page }) => {
    await mockReview(page);
    await page.goto("/settings");
    await page
      .getByRole("checkbox", { name: /Single-key shortcuts/ })
      .uncheck();
    await page.goto("/review");
    await expect(page.getByText("Single-key shortcuts are off.")).toBeVisible();
    await page.keyboard.press("j");
    await expect(
      page.getByRole("button", { name: /Contrast \(Minimum\)/ }).first(),
    ).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("c");
    await expect(
      page.getByRole("radio", { name: /Confirm issue/ }),
    ).not.toBeChecked();
  });

  test("bulk selection confirms several findings", async ({ page }) => {
    await mockReview(page);
    await page.goto("/review");
    await page
      .getByRole("button", {
        name: "Select all in group Text size and weight unknown",
      })
      .click();
    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "2 findings marked confirmed.",
    );
    await expect(page.getByText("2 selected")).toHaveCount(0);
  });

  test("bulk not-an-issue asks for a reason", async ({ page }) => {
    await mockReview(page);
    await page.goto("/review");
    await page
      .getByRole("checkbox", { name: /Select 1.4.3/ })
      .first()
      .check();
    await page.getByRole("button", { name: "Dismiss…" }).click();
    await page
      .getByRole("group", { name: "Choose a reason for dismissing" })
      .getByRole("button", { name: "Tool error" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "1 findings marked dismissed.",
    );
  });

  test("shows an empty state when nothing is waiting", async ({ page }) => {
    await mockReview(page, []);
    await page.goto("/review");
    await expect(
      page.getByRole("heading", { name: "Nothing is waiting for review" }),
    ).toBeVisible();
  });
});

test.describe("lists, settings and help", () => {
  test("sites lists one row per site with a link to the latest run", async ({
    page,
  }) => {
    await mockLists(page);
    await page.goto("/sites");
    await expect(page.getByRole("row")).toHaveCount(4);
    await expect(
      page.getByRole("link", { name: "marlowegreen.example/about" }),
    ).toHaveAttribute("href", `/runs/${"a".repeat(32)}`);
    await expect(
      page.getByText("2 fewer failures since last audit"),
    ).toBeVisible();
    await expect(page.getByText("5 of 8")).toHaveCount(2);
  });

  test("audits shows No report, not zero counts, for a failed run", async ({
    page,
  }) => {
    await mockLists(page);
    await page.goto("/audits");
    const failed = page.getByRole("row", { name: /kettleandcrumb/ });
    await expect(failed).toContainText("No report");
    await expect(failed).not.toContainText("0 critical");
  });

  test("study admin clears the token field after a successful unlock", async ({
    page,
  }) => {
    await page.goto("/study/admin");
    const field = page.getByLabel("Administration token");
    await field.fill("e2e-token");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(
      page.getByRole("button", { name: /Export/ }).first(),
    ).toBeVisible();
    await expect(field).toHaveValue("");
  });

  test("the first click on Light right after a reload applies the theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings");
    await page.reload();
    await page.getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  });

  test("audits filters live in the URL", async ({ page }) => {
    await mockLists(page);
    await page.goto("/audits");
    await expect(page.getByRole("row")).toHaveCount(4);
    await page.getByLabel("Status").selectOption("failed");
    await expect(page).toHaveURL(/status=failed/);
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("status")).toContainText("1 of 3 audits");
    await page.getByLabel("Status").selectOption("");
    await expect(page).not.toHaveURL(/status=/);
    await page.getByLabel("Viewport").selectOption("mobile");
    await expect(page).toHaveURL(/vp=mobile/);
    await expect(page.getByRole("row")).toHaveCount(3);
    await page
      .getByLabel("Site", { exact: true })
      .selectOption("fernlea-health.example");
    await expect(page.getByRole("row")).toHaveCount(2);
    await page.reload();
    await expect(page.getByLabel("Site", { exact: true })).toHaveValue(
      "fernlea-health.example",
    );
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page.getByRole("row")).toHaveCount(4);
  });

  test("audits shows an empty state for filters with no match", async ({
    page,
  }) => {
    await mockLists(page);
    await page.goto("/audits?status=cancelled");
    await expect(
      page.getByRole("heading", { name: "No audits match these filters" }),
    ).toBeVisible();
  });

  test("settings persist across a reload", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: /Compact/ }).check();
    await page
      .getByRole("checkbox", { name: /Single-key shortcuts/ })
      .uncheck();
    await page.getByRole("checkbox", { name: /Mobile/ }).uncheck();
    await page.getByRole("radio", { name: /Rules only/ }).check();
    await expect(page.getByRole("status")).toContainText(
      "saved on this device",
    );
    await page.reload();
    await expect(page.getByRole("radio", { name: /Compact/ })).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /Single-key shortcuts/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /Mobile/ }),
    ).not.toBeChecked();
    await expect(page.getByRole("radio", { name: /Rules only/ })).toBeChecked();
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("wcag-auditor.settings") ?? "{}"),
    );
    expect(stored).toMatchObject({
      density: "compact",
      shortcuts: false,
      viewports: ["desktop"],
      method: "rule_only",
    });
  });

  test("the last default viewport cannot be removed", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("checkbox", { name: /Mobile/ }).uncheck();
    await page.getByRole("checkbox", { name: /Desktop/ }).click();
    await expect(page.getByRole("checkbox", { name: /Desktop/ })).toBeChecked();
    await expect(page.getByRole("status")).toContainText(
      "Keep at least one default viewport",
    );
  });

  test("theme choice switches the page theme", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: /^Dark/ }).check();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("radio", { name: /^Light/ }).check();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("help lists the eight criteria and the limits anchor works", async ({
    page,
  }) => {
    await page.goto("/help#limits");
    await expect(
      page.getByRole("heading", { name: "What this result does not mean" }),
    ).toBeInViewport();
    await expect(page.locator("#limits")).toBeVisible();
    for (const sc of [
      "1.4.3",
      "1.4.11",
      "2.4.7",
      "2.4.11",
      "2.4.12",
      "2.4.13",
      "2.5.7",
      "2.5.8",
    ]) {
      await expect(
        page.locator("#criteria").getByText(sc, { exact: true }),
      ).toBeVisible();
    }
    for (const id of [
      "criteria",
      "tiers",
      "provenance",
      "coverage",
      "protocol",
    ]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    await expect(
      page.getByText("This tool checks 8 of the 86 WCAG 2.2"),
    ).toBeVisible();
  });

  test("not found and error pages use the shared empty state", async ({
    page,
  }) => {
    await page.goto("/nowhere");
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to overview" }),
    ).toBeVisible();
  });
});

for (const scheme of ["light", "dark"] as const) {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`workflow screens have zero axe violations (${scheme}, ${size.width})`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      await mockReview(page);
      await mockLists(page);
      for (const path of [
        "/review",
        "/review?state=decided",
        "/sites",
        "/audits",
        "/settings",
        "/help",
        "/nowhere",
        "/study",
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await scan(page, `${path} ${scheme} ${size.width}`);
      }
    });
  }
}

test("review with a selected decision form passes axe", async ({ page }) => {
  await mockReview(page);
  await page.goto("/review");
  await page.getByRole("radio", { name: /Dismiss/ }).check();
  await page.getByRole("button", { name: "Save and next" }).click();
  await scan(page, "review reason error");
  await page
    .getByRole("checkbox", { name: /Select 1.4.3/ })
    .first()
    .check();
  await page.getByRole("button", { name: "Dismiss…" }).click();
  await scan(page, "review bulk bar");
});
