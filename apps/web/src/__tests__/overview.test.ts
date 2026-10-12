import { describe, expect, it } from "vitest";
import {
  changeText,
  failureShort,
  filterSites,
  overviewSentence,
  reasonLabel,
  runStatusView,
  siteParts,
  weekComparison,
  weekRange,
} from "@/lib/overview";
import {
  condenseSteps,
  failedViewports,
  progressSentence,
  stepPosition,
} from "@/lib/progress";
import { buildSteps } from "@/lib/stages";

const ev = (
  stage: string,
  viewport: string | null = null,
  detail: string | null = null,
) => ({
  stage,
  viewport,
  detail,
});

describe("overview helpers", () => {
  it("writes an honest sentence", () => {
    expect(overviewSentence(1, 312)).toBe(
      "One audit is running and 312 findings are waiting for review.",
    );
    expect(overviewSentence(0, 0)).toBe(
      "No audit is running and no findings are waiting for review.",
    );
    expect(overviewSentence(3, 1)).toBe(
      "3 audits are running and 1 finding is waiting for review.",
    );
  });

  it("describes change since the last audit", () => {
    expect(changeText(-3, true)).toBe("3 fewer since last audit");
    expect(changeText(2, true)).toBe("2 more since last audit");
    expect(changeText(0, true)).toBe("No change since last audit");
    expect(changeText(null, false)).toBe("First audit of this site");
  });

  it("shortens needs-review reasons to a label", () => {
    expect(reasonLabel("text size and weight unknown: large-text status")).toBe(
      "Text size and weight unknown",
    );
    expect(
      reasonLabel("icon colour estimated from anti-aliased pixels (O2)"),
    ).toBe("Icon colour estimated from anti-aliased pixels");
    expect(reasonLabel(null)).toBe("No reason recorded");
  });

  it("filters sites", () => {
    const rows = [
      { failures: 2, latest_run: { status: "done" } },
      { failures: 0, latest_run: { status: "running" } },
      { failures: 0, latest_run: { status: "failed" } },
    ];
    expect(filterSites(rows, "all")).toHaveLength(3);
    expect(filterSites(rows, "failures")).toHaveLength(1);
    expect(filterSites(rows, "running")).toEqual([rows[1]]);
  });

  it("splits a site into host and path", () => {
    expect(
      siteParts({ source_kind: "url", source: "https://www.a.example/b/c/" }),
    ).toEqual({ host: "a.example", path: "/b/c" });
    expect(
      siteParts({ source_kind: "url", source: "https://a.example" }),
    ).toEqual({
      host: "a.example",
      path: "/",
    });
    expect(siteParts({ source_kind: "upload", source: "x" }).host).toBe(
      "Uploaded screenshots",
    );
  });

  it("maps run status to a shape and a plain label", () => {
    expect(runStatusView("done", null)).toEqual({
      kind: "done",
      label: "Complete",
    });
    expect(runStatusView("failed", "Timeout 30000ms").label).toBe(
      "Audit failed: timed out",
    );
    expect(runStatusView("partial", null).kind).toBe("alert");
    expect(failureShort("weird")).toBe("audit stopped");
    expect(
      runStatusView(
        "failed",
        "The site showed a bot check (Cloudflare) instead of the page.",
      ).label,
    ).toBe("Audit failed: bot check");
  });

  it("formats the week", () => {
    expect(weekRange(new Date("2026-10-11T12:00:00Z"), 0)).toBe("5 to 11 Oct");
    expect(weekRange(new Date("2026-10-01T12:00:00Z"), 0)).toBe(
      "28 Sep to 4 Oct",
    );
    expect(weekRange(new Date("2026-10-11T23:30:00Z"), 120)).toBe(
      "12 to 18 Oct",
    );
    expect(weekRange(new Date("2026-10-12T02:00:00Z"), -300)).toBe(
      "5 to 11 Oct",
    );
    expect(weekRange(new Date("2026-10-11T23:30:00Z"), 0)).toBe("5 to 11 Oct");
    expect(weekComparison(6, 4)).toBe("2 more than last week");
    expect(weekComparison(1, 4)).toBe("3 fewer than last week");
    expect(weekComparison(4, 4)).toBe("Same as last week");
  });
});

describe("progress helpers", () => {
  const events = [
    ev("queued"),
    ev("capture:desktop", "desktop"),
    ev("captured:desktop", "desktop"),
    ev("rules", "desktop"),
    ev("elements", "desktop"),
    ev("module:1.4.3", "desktop"),
    ev("module:1.4.11", "desktop"),
  ];
  const steps = condenseSteps(buildSteps(["desktop"], true, events, "running"));

  it("condenses the criteria into one step", () => {
    expect(steps.map((s) => s.label)).toEqual([
      "Queued",
      "Capture desktop",
      "Browser rules",
      "Find elements",
      "Check 8 criteria",
      "Combine results",
      "Write report",
    ]);
    const criteria = steps.find((s) => s.id === "criteria");
    expect(criteria?.status).toBe("current");
    expect(criteria?.note).toBe("1 of 8 checked");
  });

  it("reports the step position", () => {
    expect(stepPosition(steps)).toEqual({ position: 5, total: 7, done: 4 });
  });

  it("finds per-viewport failures without the run failure", () => {
    const failures = failedViewports([
      ev("failed:capture:mobile", "mobile", "timeout"),
      ev("failed:desktop", "desktop", "boom"),
      ev("failed:run", null, "x"),
    ]);
    expect(failures).toEqual([
      { viewport: "mobile", kind: "capture", detail: "timeout" },
      { viewport: "desktop", kind: "checks", detail: "boom" },
    ]);
  });

  it("writes a progress sentence", () => {
    expect(progressSentence("module:1.4.3", "desktop", 5, 7)).toBe(
      "Checking the eight criteria on desktop. Step 5 of 7.",
    );
    expect(progressSentence(undefined, null, 1, 7)).toBe(
      "Waiting to start. Step 1 of 7.",
    );
  });
});

describe("filterSites with a newer unfinished run", () => {
  it("treats a newer running run as running", () => {
    const rows = [
      {
        failures: 2,
        latest_run: { status: "done" },
        newer_run: { status: "running" },
      },
      { failures: 0, latest_run: { status: "done" }, newer_run: null },
    ];
    expect(filterSites(rows, "running")).toHaveLength(1);
  });
});
