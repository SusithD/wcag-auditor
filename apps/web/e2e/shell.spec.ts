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

const ROUTES = [
  "/",
  "/audit/new",
  "/audits",
  "/review",
  "/sites",
  "/settings",
  "/help",
  "/eval",
  "/study",
  "/study/admin",
  "/no-such-page",
];

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast-enhanced"])
    .analyze();
  expect(
    results.violations.map((v) => `${label}: ${v.id} ${v.nodes[0]?.html}`),
  ).toEqual([]);
}

test("skip link appears on first Tab and moves focus to main", async ({
  page,
}) => {
  await page.goto("/audits");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("sidebar exposes landmarks, current page and breadcrumbs", async ({
  page,
}) => {
  await page.goto("/audits");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Settings and help" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  const main = page.getByRole("navigation", { name: "Main" });
  await expect(main.getByRole("link", { name: "Audits" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    main.getByRole("link", { name: "Overview" }),
  ).not.toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: "New audit" }).first(),
  ).toHaveAttribute("href", "/audit/new");
});

test("every placeholder route has a title and an h1", async ({ page }) => {
  for (const [path, name] of [
    ["/audits", "Audits"],
    ["/review", "Review queue"],
    ["/sites", "Sites"],
    ["/settings", "Settings"],
    ["/help", "Help and method"],
    ["/audit/new", "New audit"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${name} - WCAG Auditor`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  }
});

test("command palette opens with the keyboard, navigates and returns focus on Escape", async ({
  page,
}) => {
  await page.goto("/audits");
  const overview = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Overview" });
  await overview.focus();
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(overview).toBeFocused();

  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.type("review");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect(
    dialog.getByRole("option", { name: "Review queue" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/review$/);
  await expect(dialog).toBeHidden();
});

test("search button opens the palette and Escape returns focus to it", async ({
  page,
}) => {
  await page.goto("/audits");
  const trigger = page.getByRole("button", { name: "Search" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("combobox")).toHaveAttribute(
    "aria-activedescendant",
    /opt-/,
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("palette switches the theme", async ({ page }) => {
  await page.goto("/audits");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("dark theme");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("theme toggle keeps its name and flips aria-pressed", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/audits");
  const toggle = page.getByRole("button", { name: "Dark theme" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("study participant pages have no sidebar but the admin page does", async ({
  page,
}) => {
  await page.goto("/study");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dark theme" })).toBeVisible();
  await page.goto("/study/admin");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("sidebar collapses to an icon rail at 1024 px", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/audits");
  const box = await page
    .getByRole("complementary", { name: "Sidebar" })
    .boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(63);
  expect(box?.width).toBeLessThanOrEqual(66);
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Audits" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Sites" })
    .hover();
  await expect(page.locator("[data-slot=tooltip-content]")).toHaveText("Sites");
});

test.describe("phone width (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("menu button opens a modal drawer that traps focus and returns it", async ({
    page,
  }) => {
    await page.goto("/audits");
    await expect(
      page.getByRole("complementary", { name: "Sidebar" }),
    ).toBeHidden();
    const menu = page.getByRole("button", { name: "Open menu" });
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(
      drawer.getByRole("navigation", { name: "Main" }),
    ).toBeVisible();
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.closest("[data-slot=sheet-content]") !== null,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
  });

  test("choosing a drawer link navigates and closes the drawer", async ({
    page,
  }) => {
    await page.goto("/audits");
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await drawer.getByRole("link", { name: "Sites" }).click();
    await expect(page).toHaveURL(/\/sites$/);
    await expect(drawer).toBeHidden();
  });
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`every shell route has zero axe violations at ${width} px (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ROUTES) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveClass(
          scheme === "dark" ? /dark/ : /^(?!.*dark)/,
        );
        await expect(page.locator("h1").first()).toBeVisible();
        await scan(page, path);
      }
      await page.goto("/audits");
      await page.getByRole("button", { name: "Search" }).click();
      await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
      await scan(page, "palette");
      await page.keyboard.press("Escape");
      if (width < 720) {
        await page.getByRole("button", { name: "Open menu" }).click();
        const drawer = page.getByRole("dialog", { name: "Menu" });
        await expect(drawer).toBeVisible();
        await drawer.evaluate((el) =>
          Promise.all(el.getAnimations().map((a) => a.finished)),
        );
        await scan(page, "drawer");
      }
    });
  }
}
