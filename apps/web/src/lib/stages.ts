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
const LABELS: Record<string, string> = {
  queued: "Queued",
  rules: "Rule channel",
  elements: "Page elements",
  fusion: "Fusion",
  report: "Report",
};

export function stageLabel(stage: string, viewport: string | null): string {
  const suffix = viewport ? ` (${viewport})` : "";
  if (stage.startsWith("captured:")) return `Capture ready${suffix}`;
  if (stage.startsWith("capture:")) return `Capture ${stage.split(":")[1]}`;
  if (stage.startsWith("module:"))
    return `Criterion ${stage.slice(7)}${suffix}`;
  if (stage.startsWith("failed")) return `Failed${suffix}`;
  if (stage === "done") return "Done";
  return `${LABELS[stage] ?? stage}${suffix}`;
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

export function currentStage(events: StageEvent[]): StageEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const stage = events[i].stage;
    if (!stage.startsWith("captured:") && !stage.startsWith("counts:"))
      return events[i];
  }
  return null;
}

export function buildSteps(
  viewports: string[],
  captures: boolean,
  events: StageEvent[],
  status: string,
): Step[] {
  const order = stepOrder(viewports, captures);
  const current = currentStage(events);
  const finished = status === "done" || status === "partial";
  const failed =
    status === "failed" ||
    status === "cancelled" ||
    current?.stage.startsWith("failed");
  const index = finished
    ? order.length
    : Math.max(0, order.indexOf(current?.stage ?? "queued"));
  return order.map((id, i) => {
    let state: Step["status"] = "pending";
    if (i < index) state = "done";
    else if (i === index) state = failed ? "failed" : "current";
    const label = id.startsWith("module:")
      ? `${id.slice(7)}`
      : id.startsWith("capture:")
        ? `Capture ${id.split(":")[1]}`
        : (LABELS[id] ?? id);
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

export function capturedViewports(events: StageEvent[]): string[] {
  return events
    .filter((ev) => ev.stage.startsWith("captured:"))
    .map((ev) => ev.stage.split(":")[1]);
}
