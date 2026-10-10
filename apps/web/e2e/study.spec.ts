import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

const TOKEN = { "X-Study-Token": "e2e-token" };
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

test.describe.configure({ mode: "serial" });

async function scan(page: Page) {
  await page.evaluate(() =>
    Promise.allSettled(document.getAnimations().map((a) => a.finished)),
  );
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast-enhanced"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function prepared(request: APIRequestContext) {
  await request.post("/api/study/prepare", { headers: TOKEN });
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/study/config")).json()).prepared,
      {
        timeout: 280_000,
        intervals: [2000],
      },
    )
    .toBe(16);
}

const DEMO = {
  age_band: "25-34",
  years_experience: "3-5",
  role_type: "Professional web developer",
  accessibility_exposure: "None",
  wcag_familiarity: "2",
};

async function advance(
  request: APIRequestContext,
  code: string,
  until: string,
) {
  const post = (path: string, data?: object) =>
    request.post(`/api/study/sessions/${code}${path}`, { data });
  await request.post("/api/study/sessions", { data: { code } });
  const stateOf = async () =>
    (await (await request.get(`/api/study/sessions/${code}`)).json()).next;
  for (let guard = 0; guard < 30; guard += 1) {
    const next = await stateOf();
    if (next.kind === until) return next;
    if (next.kind === "consent")
      await post("/consent", {
        statements: [true, true, true, true, true, true],
      });
    else if (next.kind === "demographics")
      await post("/demographics", { answers: DEMO });
    else if (next.kind === "task") {
      await post(`/tasks/${next.task_index}/open`);
      await post(`/tasks/${next.task_index}/submit`, { fix_text: "api fix" });
    } else if (next.kind === "sus")
      await post(`/sus/${next.block}`, {
        scores: [4, 2, 4, 2, 4, 2, 4, 2, 4, 2],
      });
    else if (next.kind === "break") await post("/break");
    else if (next.kind === "debrief")
      await post("/debrief", { answers: ["a", "b", "c"] });
    else break;
  }
  return stateOf();
}

test("the study pages are prepared and the entry rejects unknown and real codes", async ({
  page,
  request,
}) => {
  test.setTimeout(320_000);
  await prepared(request);
  await page.goto("/study");
  await expect(
    page.getByRole("heading", { level: 1, name: "Accessibility report study" }),
  ).toBeVisible();
  await expect(page.getByText(/Ethics approval is not recorded/)).toBeVisible();
  await page.getByLabel("Participant code").fill("P01");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Unknown participant code")).toBeVisible();
  await expect(page.getByLabel("Participant code")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await scan(page);
});

test("a participant completes a full AB session with timing, SUS and rubric data recorded", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/study");
  await page.getByLabel("Participant code").fill("SYN01");
  await page.getByRole("button", { name: "Start" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Before we start" }),
  ).toBeVisible();
  await expect(page.getByText(/Synthetic session/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("main [role=alert]")).toContainText(
    "Tick every required statement",
  );
  await scan(page);
  for (const box of await page.getByRole("checkbox").all()) {
    if (
      (await box
        .locator("xpath=ancestor::fieldset//legend")
        .first()
        .textContent()) === "Required"
    )
      await box.check();
  }
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "About you" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("main [role=alert]")).toContainText(
    "Choose an answer",
  );
  await scan(page);
  for (const [key, value] of Object.entries(DEMO))
    await page.locator(`#demo-${key}`).selectOption(value);
  await page.getByRole("button", { name: "Continue" }).click();

  for (const block of [1, 2]) {
    for (let n = 1; n <= 4; n += 1) {
      await expect(
        page.getByRole("heading", { level: 1, name: `Task ${n} of 4` }),
      ).toBeVisible();
      await expect(
        page.getByRole("img", {
          name: /Full-page screenshot of the task page/,
        }),
      ).toBeVisible();
      if (n === 1) await scan(page);
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator("main [role=alert]")).toContainText(
        "Write or describe",
      );
      await page.locator("#fix-text").fill(`proposed fix ${block}.${n}`);
      await page.getByRole("button", { name: "Done" }).click();
    }
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `Questionnaire ${block} of 2`,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("main [role=alert]")).toContainText(
      "Answer statement 1",
    );
    if (block === 1) await scan(page);
    for (let i = 0; i < 10; i += 1) {
      await page
        .locator(`input[name="sus-${i}"][value="${i % 2 === 0 ? 4 : 2}"]`)
        .check();
    }
    await page.getByRole("button", { name: "Continue" }).click();
    if (block === 1) {
      await expect(
        page.getByRole("heading", { level: 1, name: "Break" }),
      ).toBeVisible();
      await scan(page);
      await page
        .getByRole("button", { name: "Start the second block" })
        .click();
    }
  }
  await expect(
    page.getByRole("heading", { level: 1, name: "Debrief" }),
  ).toBeVisible();
  await scan(page);
  for (const [i, box] of (await page.getByRole("textbox").all()).entries())
    await box.fill(`answer ${i}`);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Thank you" }),
  ).toBeVisible();
  await scan(page);

  const tasks = await (
    await request.get("/api/study/admin/tasks", { headers: TOKEN })
  ).json();
  const mine = tasks.filter(
    (t: { participant_code: string }) => t.participant_code === "SYN01",
  );
  expect(mine).toHaveLength(8);
  for (const t of mine) {
    expect(t.seconds).toBeGreaterThan(0);
    expect(t.fix_text).toMatch(/^proposed fix/);
    expect(t.rubric.expected_fix).toBeTruthy();
  }
  expect(
    mine
      .filter((t: { block: number }) => t.block === 1)
      .every((t: { condition: string }) => t.condition === "rule_only"),
  ).toBe(true);
  expect(
    mine
      .filter((t: { block: number }) => t.block === 2)
      .every((t: { condition: string }) => t.condition === "hybrid"),
  ).toBe(true);

  const sus = await (
    await request.get("/api/study/admin/export/sus.csv", { headers: TOKEN })
  ).text();
  expect(sus.split("\n").filter((l) => l.startsWith("SYN01"))).toHaveLength(2);
  expect(sus).toContain("75.0");
});

test("both conditions render the same interface for the same task and the rule-only report is honest about what it did not check", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 1000 });

  async function openFirstTask(code: string) {
    await advance(request, code, "task");
    await page.goto(`/study/${code}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Task 1 of 4" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Full-page screenshot of the task page/ }),
    ).toBeVisible();
  }
  async function structure() {
    const snap = await page.locator("main").ariaSnapshot();
    const roles = snap
      .split("\n")
      .map((l) => l.trim().replace(/^- /, "").split(/[ :]/)[0])
      .filter((r) =>
        [
          "navigation",
          "complementary",
          "region",
          "heading",
          "toolbar",
          "group",
          "textbox",
          "main",
        ].includes(r),
      );
    return [...new Set(roles)].sort();
  }

  // SYN09 (rule-only first) and SYN03 (hybrid first) both start with task T3 (focus not obscured).
  await openFirstTask("SYN09");
  const ruleOnly = await structure();
  const ruleBoxes = await page.locator("svg [role=button][data-key]").count();
  await expect(page.getByText(/this report checks/)).toBeVisible();
  await expect(page.getByText(/were not assessed/)).toBeVisible();
  await expect(page.getByText("Rule-only", { exact: true })).toBeVisible();

  await openFirstTask("SYN03");
  const hybrid = await structure();
  const hybridBoxes = await page.locator("svg [role=button][data-key]").count();
  await expect(page.getByText("Hybrid", { exact: true })).toBeVisible();
  expect(ruleOnly).toEqual(hybrid);
  expect(ruleBoxes).toBe(0);
  expect(hybridBoxes).toBeGreaterThan(0);
});

test("the rule-only report shows only rule findings and says which criteria it did not assess", async ({
  request,
}) => {
  const runs = await (await request.get("/api/runs?limit=100")).json();
  const ruleOnly = runs.filter(
    (r: { condition: string; source: string }) =>
      r.condition === "rule_only" && r.source.includes("synth"),
  );
  expect(ruleOnly.length).toBe(8);
  for (const run of ruleOnly) {
    const findings = await (
      await request.get(`/api/runs/${run.id}/findings?viewport=desktop`)
    ).json();
    expect(
      findings.every((f: { provenance: string }) => f.provenance === "rule"),
    ).toBe(true);
    const overview = await (
      await request.get(`/api/runs/${run.id}/overview?viewport=desktop`)
    ).json();
    const checked = overview.coverage.filter(
      (c: { hybrid_verdict: string }) => c.hybrid_verdict === "automated",
    ).length;
    expect(checked).toBe(2);
    expect(
      overview.coverage.filter(
        (c: { pixel_verdict: string }) => c.pixel_verdict !== "none",
      ),
    ).toHaveLength(0);
  }
  const hybridRuns = runs.filter(
    (r: { condition: string; source: string }) =>
      r.condition === "hybrid" && r.source.includes("synth"),
  );
  expect(hybridRuns.length).toBe(8);
});

test("the study admin page rates fixes and exports, and every participant step passes axe in dark mode", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/study/admin");
  await page.getByLabel("Administration token").fill("e2e-token");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(
    page.getByRole("table", { name: /Submitted fixes/ }),
  ).toBeVisible();
  const first = page.getByRole("combobox", { name: /^Success for/ }).first();
  await first.selectOption("yes");
  await expect(first).toHaveValue("yes");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export tasks CSV" }).click(),
  ]);
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(await download.path(), "utf-8");
  expect(text).toMatch(/^participant_code,synthetic,order,block/);
  expect(text).toContain("rubric_expected_fix");
  await scan(page);

  for (const kind of [
    "consent",
    "demographics",
    "task",
    "sus",
    "break",
    "debrief",
    "done",
  ]) {
    const code = `SYN${String(8 + ["consent", "demographics", "task", "sus", "break", "debrief", "done"].indexOf(kind) + 1).padStart(2, "0")}`;
    await advance(request, code, kind);
    await page.goto(`/study/${code}`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    if (kind === "task")
      await expect(
        page.getByRole("img", {
          name: /Full-page screenshot of the task page/,
        }),
      ).toBeVisible();
    await scan(page);
  }
});
