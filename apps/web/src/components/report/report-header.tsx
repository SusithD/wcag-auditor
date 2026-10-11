"use client";

import { Monitor, RotateCw, Smartphone } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  type ReportState,
  type ReportView,
  serialiseState,
  type Viewport,
} from "@/lib/report";
import { relativeTime, type SourceParts, VIEWPORT_SIZE } from "./logic";
import { Seg } from "./seg";
import { ExportMenu } from "./top-bar";

type HeaderProps = {
  runId: string;
  source: SourceParts;
  createdAt: string;
  condition: string;
  viewport: Viewport;
  viewports: Viewport[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  canRerun: boolean;
  rerunning: boolean;
  rerunFailed: boolean;
  onViewport: (vp: Viewport) => void;
  onRerun: () => void;
};

export function ReportHeader({
  runId,
  source,
  createdAt,
  condition,
  viewport,
  viewports,
  headingRef,
  canRerun,
  rerunning,
  rerunFailed,
  onViewport,
  onRerun,
}: HeaderProps) {
  const Icon = viewport === "desktop" ? Monitor : Smartphone;
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="t-page text-ink outline-none [overflow-wrap:anywhere]"
        >
          <span className="sr-only">Audit report: </span>
          {source.host}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-dense text-ink-3">
          {source.path ? (
            <span className="font-mono [overflow-wrap:anywhere]">
              {source.path}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <Icon className="size-3.5" aria-hidden="true" />
            {VIEWPORT_SIZE[viewport]}
          </span>
          <span>
            {condition === "hybrid" ? "Detector and rules" : "Rules only"}
          </span>
          <span>
            Captured <time dateTime={createdAt}>{relativeTime(createdAt)}</time>
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {viewports.length > 1 ? (
          <Seg<Viewport>
            label="Viewport"
            value={viewport}
            onChange={onViewport}
            options={viewports.map((vp) => ({
              value: vp,
              label: (
                <>
                  {vp === "desktop" ? (
                    <Monitor aria-hidden="true" />
                  ) : (
                    <Smartphone aria-hidden="true" />
                  )}
                  {vp === "desktop" ? "Desktop" : "Mobile"}
                </>
              ),
            }))}
          />
        ) : null}
        <ExportMenu runId={runId} viewport={viewport} />
        {canRerun ? (
          <Button onClick={onRerun} disabled={rerunning}>
            <RotateCw aria-hidden="true" />
            Run again
          </Button>
        ) : null}
      </div>
      {rerunFailed ? (
        <p role="alert" className="w-full text-dense text-critical">
          The audit could not be started. Try again in a moment.
        </p>
      ) : null}
    </header>
  );
}

export function ViewTabs({
  runId,
  state,
  viewport,
}: {
  runId: string;
  state: ReportState;
  viewport: Viewport;
}) {
  const hrefFor = (view: ReportView) => {
    const query = serialiseState({ ...state, view, vp: state.vp ?? viewport });
    return `/runs/${runId}${query ? `?${query}` : ""}`;
  };
  const items = [
    {
      label: "Findings",
      href: hrefFor("canvas"),
      current: state.view === "canvas",
    },
    { label: "Table", href: hrefFor("table"), current: state.view === "table" },
    {
      label: "Compare with rules only",
      href: `/runs/${runId}/compare?vp=${viewport}`,
      current: false,
    },
    {
      label: "Coverage",
      href: `/runs/${runId}/coverage?vp=${viewport}`,
      current: false,
    },
  ];
  return (
    <nav
      aria-label="Report views"
      className="mt-4 flex flex-nowrap gap-x-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)]"
    >
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          replace={item.label === "Findings" || item.label === "Table"}
          scroll={false}
          aria-current={item.current ? "page" : undefined}
          className="inline-flex min-h-10 shrink-0 items-center border-b-2 whitespace-nowrap border-transparent font-medium text-ink-2 no-underline hover:text-ink aria-[current=page]:border-accent aria-[current=page]:text-ink"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
