"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, CircleAlert, CircleDot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  api,
  reportUrl,
  screenshotUrl,
  TERMINAL,
  type Viewport,
} from "@/api/client";
import { SeverityTriplet } from "@/components/severity-triplet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRunEvents } from "@/hooks/use-run-events";
import {
  buildSteps,
  capturedViewports,
  currentStage,
  findingsSoFar,
  type Step,
  stageLabel,
} from "@/lib/stages";
import { middleTruncate } from "@/lib/url";

function announcement(stage: string | undefined, viewport: string | null) {
  if (!stage) return "Queued";
  if (stage.startsWith("module:"))
    return `Checking the eight criteria${viewport ? ` (${viewport})` : ""}`;
  return stageLabel(stage, viewport);
}

function StepIcon({ status }: { status: Step["status"] }) {
  const common = { "aria-hidden": true, className: "size-4 shrink-0" } as const;
  if (status === "done") return <Check {...common} />;
  if (status === "failed") return <CircleAlert {...common} />;
  if (status === "current") return <CircleDot {...common} />;
  return (
    <Circle {...common} className="size-4 shrink-0 text-muted-foreground" />
  );
}

const STATE_TEXT: Record<Step["status"], string> = {
  done: "done",
  current: "in progress",
  pending: "waiting",
  failed: "failed",
};

function Stepper({ steps }: { steps: Step[] }) {
  const plain = steps.filter((s) => !s.group);
  const modules = steps.filter((s) => s.group);
  const modulesState = modules.some(
    (m) => m.status === "current" || m.status === "failed",
  )
    ? "current"
    : modules.every((m) => m.status === "done")
      ? "done"
      : "pending";
  const beforeModules = plain.filter(
    (s) => !["fusion", "report"].includes(s.id),
  );
  const afterModules = plain.filter((s) => ["fusion", "report"].includes(s.id));

  const item = (s: Step) => (
    <li
      key={s.id}
      aria-current={s.status === "current" ? "step" : undefined}
      className="flex min-h-6 items-center gap-2 py-0.5 text-body"
    >
      <StepIcon status={s.status} />
      <span className={s.status === "pending" ? "text-muted-foreground" : ""}>
        {s.label}
        <span className="sr-only">, {STATE_TEXT[s.status]}</span>
      </span>
    </li>
  );

  return (
    <ol className="space-y-0.5">
      {beforeModules.map(item)}
      <li
        aria-current={modulesState === "current" ? "step" : undefined}
        className="py-0.5"
      >
        <div className="flex min-h-6 items-center gap-2 text-body">
          <StepIcon status={modulesState} />
          <span
            className={
              modulesState === "pending" ? "text-muted-foreground" : ""
            }
          >
            Criteria
            <span className="sr-only">, {STATE_TEXT[modulesState]}</span>
          </span>
        </div>
        <ol className="ml-6 mt-0.5 space-y-0.5 border-l pl-3">
          {modules.map((m) => (
            <li
              key={m.id}
              className={`font-mono text-label ${m.status === "pending" ? "text-muted-foreground" : ""}`}
            >
              {m.label}
              <span className="sr-only">, {STATE_TEXT[m.status]}</span>
            </li>
          ))}
        </ol>
      </li>
      {afterModules.map(item)}
    </ol>
  );
}

function Canvas({
  runId,
  viewport,
  alt,
  ready,
}: {
  runId: string;
  viewport: Viewport | undefined;
  alt: string;
  ready: boolean;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const src = viewport && ready ? screenshotUrl(runId, viewport) : null;
  const shown = src !== null && loaded === src;
  return (
    <div
      className="relative min-h-80 overflow-hidden rounded-lg border bg-muted"
      aria-busy={!shown}
    >
      {!shown ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
      {src ? (
        // biome-ignore lint/performance/noImgElement: a full-page screenshot served by the API, not an optimisable asset
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(src)}
          className={`relative block h-auto w-full transition-opacity duration-fade ${shown ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </div>
  );
}

export function RunView({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const { data: run, isError } = useQuery({
    queryKey: ["run", runId],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/runs/{run_id}", {
        params: { path: { run_id: runId } },
      });
      if (error || !data)
        throw new Error(response.status === 404 ? "missing" : "unreachable");
      return data;
    },
    refetchInterval: (query) =>
      query.state.data && TERMINAL.has(query.state.data.status) ? false : 1500,
  });
  const { events } = useRunEvents(runId, true);
  const heading = useRef<HTMLHeadingElement>(null);
  const wasRunning = useRef(false);
  const [viewport, setViewport] = useState<Viewport | undefined>();

  const terminal = run ? TERMINAL.has(run.status) : false;
  useEffect(() => {
    if (run && !terminal) wasRunning.current = true;
    if (terminal && wasRunning.current) {
      heading.current?.focus();
      wasRunning.current = false;
    }
  }, [run, terminal]);

  if (isError) {
    return (
      <div className="mx-auto max-w-160 px-6 py-12">
        <h1 ref={heading} tabIndex={-1} className="text-h2 font-semibold">
          This run could not be loaded
        </h1>
        <p className="mt-2 text-body text-muted-foreground">
          It may not exist, or the audit service is not reachable.
        </p>
      </div>
    );
  }
  if (!run) {
    return (
      <div className="p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  const captured = capturedViewports(events);
  const available = (
    run.available_viewports.length ? run.available_viewports : captured
  ) as Viewport[];
  const shownViewport =
    viewport && available.includes(viewport) ? viewport : available[0];
  const current = currentStage(events);
  const steps = buildSteps(
    run.viewports,
    run.source_kind === "url",
    events,
    run.status,
  );
  const sofar = terminal ? run.counts : findingsSoFar(events);
  const subject =
    run.source_kind === "url" ? run.source : run.source.split("/").slice(-1)[0];
  const alt = `Full-page screenshot of ${subject}${shownViewport ? `, ${shownViewport} viewport` : ""}`;

  if (terminal) {
    const failedAll = run.status === "failed" || run.status === "cancelled";
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <p
          className="font-mono text-label text-muted-foreground"
          title={subject}
        >
          {middleTruncate(subject, 72)}
        </p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mt-1 text-h1 font-semibold tracking-tight outline-none"
        >
          {failedAll
            ? run.status === "cancelled"
              ? "Audit cancelled"
              : "Audit failed"
            : "Audit report"}
        </h1>
        {run.error ? (
          <Alert className="mt-4" variant="destructive">
            <AlertTitle>
              {run.status === "partial"
                ? "Part of the audit failed"
                : "What went wrong"}
            </AlertTitle>
            <AlertDescription>{run.error}</AlertDescription>
          </Alert>
        ) : null}
        {!failedAll ? (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <SeverityTriplet counts={run.counts} />
            {available.length > 1 ? (
              <ToggleGroup
                variant="outline"
                value={shownViewport ? [shownViewport] : []}
                onValueChange={(v) => v[0] && setViewport(v[0] as Viewport)}
                aria-label="Viewport"
              >
                {available.map((vp) => (
                  <ToggleGroupItem key={vp} value={vp}>
                    {vp === "desktop" ? "Desktop" : "Mobile"}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : null}
            {shownViewport ? (
              <>
                <a
                  className="inline-flex min-h-6 items-center underline underline-offset-4"
                  href={reportUrl(runId, "html", shownViewport)}
                >
                  Open HTML report
                </a>
                <a
                  className="inline-flex min-h-6 items-center underline underline-offset-4"
                  href={reportUrl(runId, "json", shownViewport)}
                >
                  Download JSON
                </a>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="mt-6">
          <Canvas
            runId={runId}
            viewport={shownViewport}
            alt={alt}
            ready={captured.length > 0 || available.length > 0}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[240px_1fr_240px]">
      <div className="lg:col-span-3">
        <p
          className="font-mono text-label text-muted-foreground"
          title={subject}
        >
          {middleTruncate(subject, 72)}
        </p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mt-1 text-h1 font-semibold tracking-tight outline-none"
        >
          Auditing
        </h1>
      </div>
      <nav aria-label="Audit steps">
        <Stepper steps={steps} />
        <output aria-live="polite" className="sr-only">
          {announcement(current?.stage, current?.viewport ?? null)}
        </output>
      </nav>
      <section aria-label="Page preview">
        <Canvas
          runId={runId}
          viewport={captured[0] as Viewport | undefined}
          alt={alt}
          ready={captured.length > 0}
        />
      </section>
      <aside aria-label="Findings so far" className="space-y-4">
        <div>
          <h2 className="text-h3 font-semibold">Findings so far</h2>
          <div className="mt-2">
            <SeverityTriplet counts={sofar} />
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" />}>
            Cancel audit
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this audit?</AlertDialogTitle>
              <AlertDialogDescription>
                The work done so far is discarded. You can start the audit again
                from the home page.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep auditing</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await api.POST("/runs/{run_id}/cancel", {
                    params: { path: { run_id: runId } },
                  });
                  await queryClient.invalidateQueries({
                    queryKey: ["run", runId],
                  });
                }}
              >
                Cancel audit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </aside>
    </div>
  );
}
