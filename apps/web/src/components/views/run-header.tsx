"use client";

import { Monitor, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { PageCrumbs } from "@/components/shell";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Viewport } from "@/lib/report";
import { age, middleTruncate } from "@/lib/url";
import { RunNav, type RunView } from "./run-nav";
import { focusOnMount } from "./viewport-state";

export type RunSubject = {
  source_kind: "url" | "upload" | "folder";
  source: string;
  condition: "hybrid" | "rule_only";
  created_at: string;
};

export function subjectParts(
  kind: RunSubject["source_kind"],
  source: string,
): { host: string; path: string } {
  if (kind === "url") {
    try {
      const url = new URL(source);
      const path = `${url.pathname === "/" ? "" : url.pathname}${url.search}`;
      return { host: url.host, path };
    } catch {
      return { host: source, path: "" };
    }
  }
  const last = source.split(/[\\/]/).filter(Boolean).pop();
  return { host: last ?? source, path: "" };
}

export const VIEW_NAME: Record<RunView, string> = {
  report: "Findings",
  table: "Table",
  compare: "Compare with rules only",
  coverage: "Coverage",
};

export function RunHeader({
  runId,
  run,
  viewport,
  available,
  current,
  onViewport,
  actions,
}: {
  runId: string;
  run: RunSubject;
  viewport: Viewport;
  available: Viewport[];
  current: RunView;
  onViewport: (vp: Viewport) => void;
  actions?: ReactNode;
}) {
  const { host, path } = subjectParts(run.source_kind, run.source);
  const ViewportIcon = viewport === "desktop" ? Monitor : Smartphone;
  return (
    <>
      <title>{`${VIEW_NAME[current]} - ${host} - WCAG Auditor`}</title>
      <PageCrumbs
        items={[
          { label: "Audits", href: "/audits" },
          {
            label: middleTruncate(host, 20),
            href: `/runs/${runId}?vp=${viewport}`,
          },
          { label: VIEW_NAME[current] },
        ]}
      />
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1
            ref={focusOnMount}
            tabIndex={-1}
            className="t-page wrap-break-word text-ink outline-none"
          >
            {host}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-dense text-ink-3">
            {path ? (
              <span className="font-mono" title={path}>
                {middleTruncate(path, 48)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <ViewportIcon className="size-3.5" aria-hidden="true" />
              {viewport === "desktop" ? "Desktop" : "Mobile"}
            </span>
            <span>
              {run.condition === "hybrid" ? "Detector and rules" : "Rules only"}
            </span>
            <span>Captured {age(run.created_at)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {available.length > 1 ? (
            <ToggleGroup
              variant="outline"
              value={[viewport]}
              onValueChange={(v) => v[0] && onViewport(v[0] as Viewport)}
              aria-label="Viewport"
            >
              {available.map((vp) => (
                <ToggleGroupItem key={vp} value={vp}>
                  {vp === "desktop" ? "Desktop" : "Mobile"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          {actions}
        </div>
      </header>
      <RunNav
        runId={runId}
        current={current}
        query={`?vp=${viewport}`}
        className="mt-4"
      />
    </>
  );
}
