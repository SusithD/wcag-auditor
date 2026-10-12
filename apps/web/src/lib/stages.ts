export type StageEvent = {
  stage: string;
  viewport: string | null;
  detail: string | null;
};

export const SC_LIST = [
  "1.4.3",
  "1.4.11",
  "2.4.7",
  "2.4.11",
  "2.4.12",
  "2.4.13",
  "2.5.7",
  "2.5.8",
];

export type Step = {
  id: string;
  label: string;
  status: "pending" | "current" | "done" | "failed";
  group?: "modules";
};

const FIXED = ["rules", "elements"] as const;
const TAIL = ["fusion", "report"] as const;
export const STEP_LABELS: Record<string, string> = {
  queued: "Queued",
  rules: "Browser rules",
  elements: "Find elements",
  fusion: "Combine results",
  report: "Write report",
};

export function stageLabel(stage: string, viewport: string | null): string {
  const suffix = viewport ? ` (${viewport})` : "";
  if (stage.startsWith("captured:")) return `Capture ready${suffix}`;
  if (stage.startsWith("capture:")) return `Capture ${stage.split(":")[1]}`;
  if (stage.startsWith("module:"))
    return `Criterion ${stage.slice(7)}${suffix}`;
  if (stage.startsWith("failed")) return `Failed${suffix}`;
  if (stage === "done") return "Done";
  return `${STEP_LABELS[stage] ?? stage}${suffix}`;
}

export function stepOrder(viewports: string[], captures: boolean): string[] {
  return [
    "queued",
    ...(captures ? viewports.map((vp) => `capture:${vp}`) : []),
    ...FIXED,
    ...SC_LIST.map((sc) => `module:${sc}`),
    ...TAIL,
  ];
}

export function verifyWait(
  events: StageEvent[],
): { viewport: string | null; seconds: number } | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev.stage === "waiting:verify")
      return { viewport: ev.viewport, seconds: Number(ev.detail) || 0 };
    if (
      ev.stage.startsWith("capture") ||
      ev.stage.startsWith("failed") ||
      ev.stage === "done"
    )
      return null;
  }
  return null;
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function currentStage(events: StageEvent[]): StageEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const stage = events[i].stage;
    if (!stage.startsWith("captured:") && !stage.startsWith("counts:"))
      return events[i];
  }
  return null;
}

function progressIndex(order: string[], events: StageEvent[]) {
  let index = 0;
  for (const ev of events) {
    const at = order.indexOf(ev.stage);
    if (at > index) index = at;
  }
  return index;
}

export function buildSteps(
  viewports: string[],
  captures: boolean,
  events: StageEvent[],
  status: string,
): Step[] {
  const order = stepOrder(viewports, captures);
  const finished = status === "done" || status === "partial";
  const failed =
    status === "failed" ||
    status === "cancelled" ||
    events.some(
      (ev) => ev.stage.startsWith("failed") && ev.stage !== "failed:run",
    );
  const index = finished ? order.length : progressIndex(order, events);
  return order.map((id, i) => {
    let state: Step["status"] = "pending";
    if (i < index) state = "done";
    else if (i === index) state = failed ? "failed" : "current";
    const label = id.startsWith("module:")
      ? `${id.slice(7)}`
      : id.startsWith("capture:")
        ? `Capture ${id.split(":")[1]}`
        : (STEP_LABELS[id] ?? id);
    return {
      id,
      label,
      status: state,
      group: id.startsWith("module:") ? "modules" : undefined,
    };
  });
}

export function findingsSoFar(events: StageEvent[]) {
  const total = { critical: 0, serious: 0, minor: 0, needs_review: 0 };
  for (const ev of events) {
    if (!ev.stage.startsWith("counts:") || !ev.detail) continue;
    try {
      const c = JSON.parse(ev.detail) as Record<string, number>;
      for (const key of Object.keys(total) as (keyof typeof total)[])
        total[key] += c[key] ?? 0;
    } catch {}
  }
  return total;
}

export type CriterionSoFar = {
  sc: string;
  total: number;
  byViewport: Record<string, number>;
};

export function criteriaSoFar(events: StageEvent[]): CriterionSoFar[] {
  const rows = new Map<string, CriterionSoFar>();
  for (const ev of events) {
    if (!ev.stage.startsWith("counts:") || !ev.detail) continue;
    const viewport = ev.viewport ?? ev.stage.split(":")[1];
    try {
      const parsed = JSON.parse(ev.detail) as {
        criteria?: Record<string, number>;
      };
      for (const [sc, n] of Object.entries(parsed.criteria ?? {})) {
        if (!(n > 0)) continue;
        const row = rows.get(sc) ?? { sc, total: 0, byViewport: {} };
        row.total += n;
        row.byViewport[viewport] = (row.byViewport[viewport] ?? 0) + n;
        rows.set(sc, row);
      }
    } catch {}
  }
  return [...rows.values()].sort((a, b) =>
    a.sc.localeCompare(b.sc, undefined, { numeric: true }),
  );
}

export function capturedViewports(events: StageEvent[]): string[] {
  return events
    .filter((ev) => ev.stage.startsWith("captured:"))
    .map((ev) => ev.stage.split(":")[1]);
}

const STATE_TEXT: Record<Step["status"], string> = {
  done: "done",
  current: "in progress",
  pending: "waiting",
  failed: "failed",
};

export function stepSpokenName(step: Step): string {
  const name =
    step.group === "modules" ? `Criterion ${step.label}` : step.label;
  return `${name}, ${STATE_TEXT[step.status]}`;
}

export function groupSpokenName(name: string, status: Step["status"]): string {
  return `${name}, ${STATE_TEXT[status]}`;
}
