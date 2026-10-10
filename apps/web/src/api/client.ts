import createClient from "openapi-fetch";
import type { components, paths } from "./types";

export const api = createClient<paths>({ baseUrl: "/api" });

export type RunSummary = components["schemas"]["RunSummary"];
export type Viewport = NonNullable<
  components["schemas"]["RunCreate"]["viewports"]
>[number];
export type Condition = NonNullable<
  components["schemas"]["RunCreate"]["condition"]
>;

export const TERMINAL = new Set(["done", "failed", "partial", "cancelled"]);

export function screenshotUrl(runId: string, viewport: Viewport) {
  return `/api/runs/${runId}/assets/${viewport}/screenshot`;
}

export function reportUrl(
  runId: string,
  ext: "json" | "html" | "pdf",
  viewport: Viewport,
) {
  return `/api/runs/${runId}/report.${ext}?viewport=${viewport}`;
}
