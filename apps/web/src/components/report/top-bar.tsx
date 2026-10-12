"use client";

import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { Tag } from "@/components/ds";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExports } from "@/hooks/use-report-data";
import { formatBytes, type ReportView, type Viewport } from "@/lib/report";
import { middleTruncate } from "@/lib/url";
import { Seg } from "./seg";

const NAMES = { json: "JSON", html: "HTML", pdf: "PDF", csv: "CSV" } as const;

export function ExportMenu({
  runId,
  viewport,
}: {
  runId: string;
  viewport: Viewport;
}) {
  const [opened, setOpened] = useState(false);
  const exports = useExports(runId, viewport, opened);
  return (
    <DropdownMenu onOpenChange={(o) => o && setOpened(true)}>
      <DropdownMenuTrigger render={<Button />}>
        <Download aria-hidden="true" />
        Export report
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {exports.isPending ? (
          <DropdownMenuItem disabled>Preparing exports</DropdownMenuItem>
        ) : exports.isError || !exports.data?.length ? (
          <DropdownMenuItem disabled>No exports available</DropdownMenuItem>
        ) : (
          exports.data.map((e) => (
            <DropdownMenuItem
              key={e.format}
              render={<a href={`/api${e.url}`} download />}
            >
              <span className="flex-1">{NAMES[e.format]}</span>
              <span className="font-mono text-xs text-ink-3">
                {e.pages ? `${e.pages} pages, ` : ""}
                {formatBytes(e.size_bytes)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type EmbeddedProps = {
  subject: string;
  condition: string;
  viewport: Viewport;
  viewports: Viewport[];
  view: ReportView;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onViewport: (vp: Viewport) => void;
  onView: (view: ReportView) => void;
};

export function EmbeddedBar({
  subject,
  condition,
  viewport,
  viewports,
  view,
  headingRef,
  onViewport,
  onView,
}: EmbeddedProps) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-1.5">
      <div className="min-w-0 flex-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="t-section text-ink outline-none"
        >
          Audit report
        </h2>
        <p className="truncate font-mono text-xs text-ink-3" title={subject}>
          {middleTruncate(subject, 80)}
        </p>
      </div>
      <Tag>{`Condition: ${condition === "hybrid" ? "Hybrid" : "Rule-only"}`}</Tag>
      {viewports.length > 1 ? (
        <Seg<Viewport>
          label="Viewport"
          value={viewport}
          onChange={onViewport}
          options={viewports.map((vp) => ({
            value: vp,
            label: vp === "desktop" ? "Desktop" : "Mobile",
          }))}
        />
      ) : null}
      <Seg<ReportView>
        label="View mode"
        value={view}
        onChange={onView}
        options={[
          { value: "canvas", label: "Canvas" },
          { value: "table", label: "Table" },
        ]}
      />
    </div>
  );
}
