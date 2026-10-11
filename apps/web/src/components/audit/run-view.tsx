"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, screenshotUrl, TERMINAL, type Viewport } from "@/api/client";
import {
  EmptyState,
  Meter,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Status,
  StatusShape,
} from "@/components/ds";
import { PageTitle } from "@/components/page-title";
import { ReportScreen } from "@/components/report/report-screen";
import { PageCrumbs, WideContent } from "@/components/shell/shell-context";
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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunEvents } from "@/hooks/use-run-events";
import { siteParts, viewportWords } from "@/lib/overview";
import {
  type CondensedStep,
  condenseSteps,
  criteriaChecked,
  failedViewports,
  progressSentence,
  stepPosition,
} from "@/lib/progress";
import {
  buildSteps,
  capturedViewports,
  currentStage,
  findingsSoFar,
} from "@/lib/stages";
import { describeRunError } from "@/lib/url";
import { startAudit } from "./audit-request";

const SPOKEN: Record<CondensedStep["status"], string> = {
  done: "done",
  current: "in progress",
  pending: "waiting",
  failed: "failed",
};

const VIEWPORT_SIZE: Record<string, string> = {
  desktop: "1280 × 800",
  mobile: "390 × 844",
};

function StepList({ steps }: { steps: CondensedStep[] }) {
  return (
    <ol aria-labelledby="steps-h" className="m-0 list-none px-4 pb-4 pt-2">
      {steps.map((step, index) => (
        <li
          key={step.id}
          aria-current={step.status === "current" ? "step" : undefined}
          className={`relative grid min-h-10 grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-3 ${
            step.status === "current"
              ? "font-semibold text-ink"
              : step.status === "pending"
                ? "text-ink-3"
                : "text-ink"
          } ${index > 0 ? "before:absolute before:-top-5 before:left-[5.5px] before:h-10 before:w-px before:bg-line" : ""}`}
        >
          <span className="relative z-10 grid size-3 place-items-center bg-surface">
            {step.status === "pending" ? (
              <span
                aria-hidden="true"
                className="size-2 rounded-full border border-line-strong bg-surface"
              />
            ) : (
              <StatusShape
                kind={
                  step.status === "done"
                    ? "done"
                    : step.status === "failed"
                      ? "failed"
                      : "running"
                }
              />
            )}
          </span>
          <span>
            {step.label}
            <span className="sr-only">, {SPOKEN[step.status]}</span>
          </span>
          <span className="num text-dense font-normal text-ink-3">
            {step.note ?? (step.status === "current" ? "In progress" : "")}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Preview({
  runId,
  viewport,
  subject,
}: {
  runId: string;
  viewport: Viewport | undefined;
  subject: string;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const src = viewport ? screenshotUrl(runId, viewport) : null;
  const shown = src !== null && loaded === src;
  return (
    <PanelBody>
      <div className="h-[400px] overflow-hidden rounded-md border border-line bg-subtle px-4 pt-4 max-[720px]:h-80 max-[720px]:px-3 max-[720px]:pt-3">
        <div
          className="relative h-full overflow-hidden rounded-t-md border border-b-0 border-line bg-surface"
          aria-busy={!shown}
        >
          {!shown ? (
            <Skeleton className="absolute inset-0 rounded-none" />
          ) : null}
          {src ? (
            // biome-ignore lint/performance/noImgElement: a full-page screenshot served by the API, not an optimisable asset
            <img
              src={src}
              alt={`${viewport === "mobile" ? "Mobile" : "Desktop"} capture of ${subject}`}
              onLoad={() => setLoaded(src)}
              className={`relative block size-full object-cover object-top transition-opacity duration-fade ${shown ? "opacity-100" : "opacity-0"}`}
            />
          ) : null}
        </div>
      </div>
      <p className="mb-0 mt-3 text-dense text-ink-3">
        {viewport
          ? `${viewport === "mobile" ? "Mobile" : "Desktop"} ${VIEWPORT_SIZE[viewport]} px`
          : null}
      </p>
    </PanelBody>
  );
}

function RunAgain({
  run,
}: {
  run: {
    source_kind: string;
    source: string;
    viewports: Viewport[];
    condition: "hybrid" | "rule_only";
  };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const again = useMutation({
    mutationFn: () =>
      startAudit(
        { url: run.source },
        { viewports: run.viewports, condition: run.condition, budget: 15 },
        queryClient,
      ),
    onSuccess: (runId) => router.push(`/runs/${runId}`),
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : "The audit could not be started",
      ),
  });
  if (run.source_kind !== "url") return null;
  return (
    <>
      <Button
        type="button"
        variant="primary"
        aria-disabled={again.isPending}
        onClick={() => {
          if (again.isPending) return;
          setError(null);
          again.mutate();
        }}
      >
        <RotateCw aria-hidden="true" />
        Run again
      </Button>
      {error ? (
        <p role="alert" className="basis-full text-body text-critical">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function RunView({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const {
    data: run,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
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
  const terminalNow = run ? TERMINAL.has(run.status) : false;
  const { events } = useRunEvents(runId, !terminalNow);
  const heading = useRef<HTMLHeadingElement>(null);
  const alertTitle = useRef<HTMLDivElement>(null);
  const wasRunning = useRef(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const terminal = run ? TERMINAL.has(run.status) : false;
  useEffect(() => {
    if (run && !terminal) wasRunning.current = true;
    if (terminal && wasRunning.current) {
      (alertTitle.current ?? heading.current)?.focus();
      wasRunning.current = false;
    }
  }, [run, terminal]);

  const failedWithError =
    run?.status === "failed" || run?.status === "cancelled"
      ? Boolean(run.error)
      : false;
  useEffect(() => {
    if (failedWithError) alertTitle.current?.focus();
  }, [failedWithError]);

  if (isError && !run) {
    const missing = error instanceof Error && error.message === "missing";
    return (
      <>
        <PageTitle
          title={`${missing ? "Audit not found" : "Audit unavailable"} - WCAG Auditor`}
        />
        <PageCrumbs items={[{ label: "Audits", href: "/audits" }]} />
        <EmptyState
          as="h1"
          title={missing ? "Audit not found" : "This audit could not be loaded"}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {missing ? null : (
                <Button
                  type="button"
                  aria-disabled={isFetching}
                  onClick={() => {
                    if (!isFetching) void refetch();
                  }}
                >
                  Try again
                </Button>
              )}
              <Link
                href="/audit/new"
                className={buttonVariants({
                  variant: missing ? "primary" : "default",
                })}
              >
                Back to New audit
              </Link>
            </div>
          }
        >
          {missing
            ? "There is no audit with this address. It may have been removed, or the address may have a typing mistake."
            : "The audit service did not answer. Check that it is running, then try again."}
        </EmptyState>
      </>
    );
  }
  if (!run) {
    return (
      <div aria-busy="true">
        <PageTitle title="Audit - WCAG Auditor" />
        <p className="sr-only">Loading the audit</p>
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  if (terminal && run.status !== "failed" && run.status !== "cancelled")
    return <ReportScreen run={run} headingRef={heading} />;

  const { host, path } = siteParts(run);
  const subject = host;
  const crumbs = [{ label: "Audits", href: "/audits" }, { label: host }];
  const method =
    run.condition === "hybrid" ? "Detector and rules" : "Rules only";
  const meta = [path || null, viewportWords(run.viewports), method]
    .filter(Boolean)
    .join(" · ");

  if (terminal) {
    const cancelled = run.status === "cancelled";
    return (
      <>
        <PageTitle
          title={`${cancelled ? "Audit cancelled" : "Audit failed"} - ${subject}`}
        />
        <PageCrumbs items={crumbs} />
        <header className="mb-6">
          <p className="m-0 text-dense text-ink-3" title={run.source}>
            {host}
            {path && path !== "/" ? path : ""}
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="t-page mt-1 text-ink outline-none"
          >
            {cancelled ? "Audit cancelled" : "Audit failed"}
          </h1>
          <p className="mt-1 text-ink-2">{meta}</p>
        </header>
        {run.error ? (
          <Panel
            as="div"
            role="alert"
            className="border-l-[3px] border-l-critical p-4"
          >
            <div
              ref={alertTitle}
              tabIndex={-1}
              className="flex items-center gap-2 font-semibold outline-none"
            >
              <StatusShape kind="alert" />
              What went wrong
            </div>
            <p className="mb-0 mt-2 text-body text-ink">
              {describeRunError(run.error)}
            </p>
            <Collapsible className="mt-2">
              <CollapsibleTrigger className="inline-flex min-h-7 items-center text-dense text-ink-2 underline underline-offset-4">
                Technical details
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-label text-ink-2">
                  {run.error}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </Panel>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <RunAgain run={run} />
          <Link href="/audit/new" className={buttonVariants()}>
            Start a new audit
          </Link>
        </div>
      </>
    );
  }

  const captured = capturedViewports(events);
  const available = (
    run.available_viewports.length ? run.available_viewports : captured
  ) as Viewport[];
  const previewViewport = (available[0] ?? captured[0]) as Viewport | undefined;
  const current = currentStage(events);
  const raw = buildSteps(
    run.viewports,
    run.source_kind === "url",
    events,
    run.status,
  );
  const problems = failedViewports(events);
  const condensed = condenseSteps(raw);
  const steps = condensed.map((step) => {
    const captureFailed = problems.some(
      (p) => p.kind === "capture" && step.id === `capture:${p.viewport}`,
    );
    if (captureFailed) return { ...step, status: "failed" as const };
    return step.status === "failed"
      ? { ...step, status: "current" as const }
      : step;
  });
  const { position, total, done } = stepPosition(condensed);
  const sofar = findingsSoFar(events);
  const failures = sofar.critical + sofar.serious + sofar.minor;
  const checked = criteriaChecked(raw);
  const started = new Date(
    /Z|[+-]\d\d:?\d\d$/.test(run.created_at)
      ? run.created_at
      : `${run.created_at}Z`,
  );

  return (
    <>
      <PageTitle title={`Auditing ${subject} - WCAG Auditor`} />
      <PageCrumbs items={crumbs} />
      <WideContent />
      <PageHeader
        title={host}
        description={
          <>
            {meta} · Started{" "}
            <time dateTime={started.toISOString()} className="num">
              {started.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </>
        }
        className="mb-4"
        actions={
          <>
            {cancelError ? (
              <p role="alert" className="m-0 text-body text-critical">
                {cancelError}
              </p>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="default" />}>
                Cancel audit
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this audit?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The work done so far is discarded. You can start the audit
                    again from the Overview.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep auditing</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      const { error: failure } = await api.POST(
                        "/runs/{run_id}/cancel",
                        { params: { path: { run_id: runId } } },
                      );
                      setCancelError(
                        failure ? "The audit could not be cancelled" : null,
                      );
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
          </>
        }
      />

      <section aria-label="Audit progress" className="mb-6 flex flex-col gap-3">
        <output className="m-0 block text-h3 font-medium">
          {progressSentence(
            current?.stage,
            current?.viewport ?? null,
            position,
            total,
          )}
        </output>
        <Meter
          decided={done}
          total={total}
          label={`Step ${position} of ${total}, ${done} steps done`}
        />
      </section>

      <div className="grid grid-cols-[280px_minmax(0,1fr)_320px] items-start gap-4 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1">
        <Panel aria-labelledby="steps-h">
          <PanelHeader id="steps-h" title="Steps" />
          <StepList steps={steps} />
        </Panel>
        <Panel
          aria-labelledby="prev-h"
          className="max-[1100px]:order-first max-[1100px]:col-span-full"
        >
          <PanelHeader id="prev-h" title="Live preview" />
          {previewViewport ? (
            <Preview
              runId={runId}
              viewport={previewViewport}
              subject={subject}
            />
          ) : (
            <PanelBody>
              <p className="m-0 text-body text-ink-2">
                The preview appears when the first capture is ready.
              </p>
            </PanelBody>
          )}
        </Panel>
        <Panel aria-labelledby="found-h">
          <PanelHeader
            id="found-h"
            title="Found so far"
            right={<span className="num">{failures} failures</span>}
          />
          <PanelBody>
            <ul className="m-0 flex list-none flex-col p-0">
              {(
                [
                  ["critical", "Critical", sofar.critical],
                  ["serious", "Serious", sofar.serious],
                  ["minor", "Minor", sofar.minor],
                  ["review", "Needs review", sofar.needs_review],
                ] as const
              ).map(([kind, label, n]) => (
                <li
                  key={kind}
                  className="flex min-h-9 items-center justify-between gap-3 border-b border-line py-1.5 last:border-b-0"
                >
                  <Status kind={kind} zero={n === 0} strong={n > 0}>
                    {label}
                  </Status>
                  <span
                    className={`num font-semibold ${n === 0 ? "font-normal text-ink-3" : ""}`}
                  >
                    {n}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mb-0 mt-3 text-dense text-ink-3">
              Counts update when each viewport finishes its checks.
            </p>
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              <div className="flex justify-between font-medium">
                <span>Criteria checked</span>
                <span className="num">{checked} of 8</span>
              </div>
              <Meter
                decided={checked}
                label={`${checked} of 8 criteria checked`}
              />
            </div>
          </PanelBody>
        </Panel>
      </div>

      {problems.length > 0 ? (
        <Panel
          as="div"
          role="alert"
          className="mt-6 border-l-[3px] border-l-critical p-4"
        >
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {problems.map((problem) => (
              <li key={problem.viewport}>
                <p className="m-0 flex items-start gap-2 text-body">
                  <StatusShape kind="alert" className="mt-1" />
                  <span>
                    <b className="font-semibold">
                      {problem.viewport === "mobile" ? "Mobile" : "Desktop"}{" "}
                      {problem.kind === "capture" ? "capture" : "checks"}{" "}
                      failed.
                    </b>{" "}
                    {describeRunError(problem.detail)} Results for the other
                    viewports will be available.
                  </span>
                </p>
                {problem.detail ? (
                  <Collapsible className="ml-5">
                    <CollapsibleTrigger className="inline-flex min-h-7 items-center text-dense text-ink-2 underline underline-offset-4">
                      Details
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-label text-ink-2">
                        {problem.detail}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <p className="mt-4 text-dense text-ink-3">
        You can leave this page. The audit keeps running.
      </p>
    </>
  );
}
