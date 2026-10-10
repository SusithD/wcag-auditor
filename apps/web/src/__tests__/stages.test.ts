import { describe, expect, it } from "vitest";
import {
  buildSteps,
  capturedViewports,
  currentStage,
  findingsSoFar,
  stageLabel,
} from "@/lib/stages";

const ev = (
  stage: string,
  viewport: string | null = null,
  detail: string | null = null,
) => ({
  stage,
  viewport,
  detail,
});

describe("stage model", () => {
  it("marks earlier steps done, the current step current and the rest pending", () => {
    const steps = buildSteps(
      ["desktop"],
      true,
      [ev("queued"), ev("capture:desktop", "desktop"), ev("rules", "desktop")],
      "running",
    );
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.status]));
    expect(byId.queued).toBe("done");
    expect(byId["capture:desktop"]).toBe("done");
    expect(byId.rules).toBe("current");
    expect(byId.elements).toBe("pending");
    expect(byId["module:2.5.8"]).toBe("pending");
  });

  it("skips capture steps for folder and upload sources", () => {
    const ids = buildSteps(["desktop", "mobile"], false, [], "queued").map(
      (s) => s.id,
    );
    expect(ids.some((id) => id.startsWith("capture:"))).toBe(false);
    expect(ids.filter((id) => id.startsWith("module:"))).toHaveLength(8);
  });

  it("finishes every step when the run is done and fails the current one when it fails", () => {
    expect(
      buildSteps(["desktop"], true, [ev("report")], "done").every(
        (s) => s.status === "done",
      ),
    ).toBe(true);
    const failed = buildSteps(
      ["desktop"],
      true,
      [ev("rules", "desktop")],
      "failed",
    );
    expect(failed.find((s) => s.id === "rules")?.status).toBe("failed");
  });

  it("ignores bookkeeping events when finding the current stage", () => {
    const events = [
      ev("rules"),
      ev("captured:desktop", "desktop", "/x"),
      ev("counts:desktop", "desktop", "{}"),
    ];
    expect(currentStage(events)?.stage).toBe("rules");
    expect(currentStage([])).toBeNull();
  });

  it("sums per-viewport counts and ignores malformed ones", () => {
    const events = [
      ev(
        "counts:desktop",
        "desktop",
        JSON.stringify({ critical: 1, serious: 2, minor: 3, needs_review: 4 }),
      ),
      ev("counts:mobile", "mobile", JSON.stringify({ critical: 1 })),
      ev("counts:x", "x", "not json"),
    ];
    expect(findingsSoFar(events)).toEqual({
      critical: 2,
      serious: 2,
      minor: 3,
      needs_review: 4,
    });
  });

  it("lists captured viewports and labels stages with their viewport", () => {
    expect(
      capturedViewports([ev("captured:mobile", "mobile"), ev("rules")]),
    ).toEqual(["mobile"]);
    expect(stageLabel("module:1.4.3", "mobile")).toBe(
      "Criterion 1.4.3 (mobile)",
    );
    expect(stageLabel("rules", null)).toBe("Rule channel");
  });
});
