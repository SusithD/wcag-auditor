import type { StageEvent, Step } from "@/lib/stages";

export type CondensedStep = {
  id: string;
  label: string;
  status: Step["status"];
  note: string | null;
};

const TAIL_LABELS: Record<string, string> = {
  queued: "Queued",
  rules: "Browser rules",
  elements: "Find elements",
  fusion: "Combine results",
  report: "Write report",
};

function modulesState(modules: Step[]): Step["status"] {
  if (modules.some((m) => m.status === "failed")) return "failed";
  if (modules.some((m) => m.status === "current")) return "current";
  if (modules.length > 0 && modules.every((m) => m.status === "done"))
    return "done";
  return "pending";
}

export function criteriaChecked(steps: Step[]): number {
  return steps.filter((s) => s.group === "modules" && s.status === "done")
    .length;
}

export function condenseSteps(steps: Step[]): CondensedStep[] {
  const modules = steps.filter((s) => s.group === "modules");
  const checked = criteriaChecked(steps);
  const out: CondensedStep[] = [];
  let placed = false;
  for (const step of steps) {
    if (step.group === "modules") {
      if (placed) continue;
      placed = true;
      const state = modulesState(modules);
      out.push({
        id: "criteria",
        label: "Check 8 criteria",
        status: state,
        note: state === "current" ? `${checked} of 8 checked` : null,
      });
      continue;
    }
    const label = step.id.startsWith("capture:")
      ? `Capture ${step.id.split(":")[1]}`
      : (TAIL_LABELS[step.id] ?? step.label);
    out.push({ id: step.id, label, status: step.status, note: null });
  }
  return out;
}

export function stepPosition(steps: CondensedStep[]): {
  position: number;
  total: number;
  done: number;
} {
  const done = steps.filter((s) => s.status === "done").length;
  const current = steps.findIndex(
    (s) => s.status === "current" || s.status === "failed",
  );
  return {
    position: current === -1 ? Math.min(done + 1, steps.length) : current + 1,
    total: steps.length,
    done,
  };
}

export type ViewportFailure = {
  viewport: string;
  kind: "capture" | "checks";
  detail: string | null;
};

export function failedViewports(events: StageEvent[]): ViewportFailure[] {
  const seen = new Map<string, ViewportFailure>();
  for (const ev of events) {
    if (!ev.stage.startsWith("failed") || ev.stage === "failed:run") continue;
    const viewport = ev.viewport ?? ev.stage.split(":").slice(-1)[0];
    if (!seen.has(viewport))
      seen.set(viewport, {
        viewport,
        kind: ev.stage.startsWith("failed:capture") ? "capture" : "checks",
        detail: ev.detail,
      });
  }
  return [...seen.values()];
}

export function progressSentence(
  stage: string | undefined,
  viewport: string | null,
  position: number,
  total: number,
): string {
  const on = viewport ? ` on ${viewport}` : "";
  let what = "Waiting to start";
  if (stage) {
    if (stage.startsWith("capture:")) what = `Capturing the page${on}`;
    else if (stage === "rules") what = `Running the browser rules${on}`;
    else if (stage === "elements") what = `Finding page elements${on}`;
    else if (stage.startsWith("module:"))
      what = `Checking the eight criteria${on}`;
    else if (stage === "fusion") what = `Combining results${on}`;
    else if (stage === "report") what = `Writing the report${on}`;
    else if (stage !== "queued") what = "Working";
  }
  return `${what}. Step ${position} of ${total}.`;
}
