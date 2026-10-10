"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RunNav } from "@/components/views/run-nav";
import { useExports } from "@/hooks/use-report-data";
import { formatBytes, type ReportView, type Viewport } from "@/lib/report";
import { middleTruncate } from "@/lib/url";

type Props = {
  runId: string;
  subject: string;
  condition: string;
  viewport: Viewport;
  viewports: Viewport[];
  view: ReportView;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onViewport: (vp: Viewport) => void;
  onView: (view: ReportView) => void;
};

const NAMES = { json: "JSON", html: "HTML", pdf: "PDF", csv: "CSV" } as const;

export function TopBar({
  runId,
  subject,
  condition,
  viewport,
  viewports,
  view,
  headingRef,
  onViewport,
  onView,
}: Props) {
  const [opened, setOpened] = useState(false);
  const exports = useExports(runId, viewport, opened);

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-1.5">
      <div className="min-w-0 flex-1">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-row font-semibold outline-none"
        >
          Audit report
        </h1>
        <p
          className="truncate font-mono text-label text-muted-foreground"
          title={subject}
        >
          {middleTruncate(subject, 80)}
        </p>
      </div>
      <RunNav runId={runId} current="report" query={`?vp=${viewport}`} />
      <Badge variant="outline">
        {condition === "hybrid" ? "Hybrid" : "Rule-only"}
      </Badge>
      {viewports.length > 1 ? (
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[viewport]}
          onValueChange={(v) => v[0] && onViewport(v[0] as Viewport)}
          aria-label="Viewport"
        >
          {viewports.map((vp) => (
            <ToggleGroupItem key={vp} value={vp}>
              {vp === "desktop" ? "Desktop" : "Mobile"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      <ToggleGroup
        variant="outline"
        size="sm"
        value={[view]}
        onValueChange={(v) => v[0] && onView(v[0] as ReportView)}
        aria-label="Findings view"
      >
        <ToggleGroupItem value="canvas">Canvas</ToggleGroupItem>
        <ToggleGroupItem value="table">Table</ToggleGroupItem>
      </ToggleGroup>
      <DropdownMenu onOpenChange={(o) => o && setOpened(true)}>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <Download aria-hidden="true" />
          Export
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
                <span className="font-mono text-label text-muted-foreground">
                  {e.pages ? `${e.pages} pages, ` : ""}
                  {formatBytes(e.size_bytes)}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
