import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/"];

for (const scheme of ["light", "dark"] as const) {
  for (const route of ROUTES) {
    test(`${route} has zero axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(route);
      await expect(page.locator("html")).toHaveClass(
        scheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}
