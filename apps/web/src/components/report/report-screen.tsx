"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunSummary } from "@/api/client";
import { Panel, StatusShape } from "@/components/ds";
import { PageCrumbs, WideContent } from "@/components/shell";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useFindings, useOverview } from "@/hooks/use-report-data";
import { useReportState } from "@/hooks/use-report-state";
import {
  applyFilters,
  countBySev,
  cycle,
  type Finding,
  filterMessage,
  type ReportState,
  readingOrder,
  SC_LIST,
  selectionMessage,
  type Viewport,
} from "@/lib/report";
import { Canvas } from "./canvas";
import { CriteriaRail } from "./criteria-rail";
import { DetailPane } from "./detail-pane";
import { FindingsTable } from "./findings-table";
import type { PairMode } from "./focus-pair";
import { focusWhenReady } from "./focus-when-ready";
import { type GroupBy, sourceParts, tally as tallyOf } from "./logic";
import { ReportHeader, ViewTabs } from "./report-header";
import { SummaryPanel } from "./summary-panel";
import { EmbeddedBar } from "./top-bar";
import {
  type DecisionVars,
  useDecideFinding,
  useDelta,
  useRunAgain,
} from "./use-report-queries";
import { useShortcutsEnabled } from "./use-shortcuts-setting";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}

type FocusRequest = { kind: "detail" | "origin" | "table"; n: number };

function originElement(key: string | null) {
  if (!key) return null;
  const root = document.getElementById("canvas-region");
  return (
    root?.querySelector<HTMLElement>(`svg [role=button][data-key="${key}"]`) ??
    root?.querySelector<HTMLElement>(`button[data-row-key="${key}"]`)
  );
}

function decisionMessage(vars: Omit<DecisionVars, "id">): string {
  if (vars.status === "fixed")
    return "Marked as fixed. Fix not verified until a later audit no longer finds it.";
  if (vars.status === "dismissed")
    return `Dismissed${vars.reason ? `: ${vars.reason}` : ""}.`;
  if (vars.status === "open") return "Reopened.";
  return "Decision saved.";
}

export function ReportScreen({
  run,
  headingRef,
  embedded = false,
  className = "h-[calc(100dvh-6.5rem)]",
}: {
  run: RunSummary;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  embedded?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { state, update } = useReportState();
  const wide = useMediaQuery(
    embedded ? "(min-width: 1760px)" : "(min-width: 1440px)",
    true,
  );
  const medium = useMediaQuery("(min-width: 1024px)", true);
  const shortcuts = useShortcutsEnabled();
  const [pairMode, setPairMode] = useState<PairMode>("page");
  const [tab, setTab] = useState("canvas");
  const [groupBy, setGroupBy] = useState<GroupBy>("criterion");
  const [query, setQuery] = useState(state.q);
  const [message, setMessage] = useState("");
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const originKey = useRef<string | null>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const announce = useCallback((text: string) => {
    clearTimeout(announceTimer.current);
    setMessage("");
    announceTimer.current = setTimeout(() => setMessage(text), 60);
  }, []);
  useEffect(() => () => clearTimeout(announceTimer.current), []);
  const requestFocus = useCallback(
    (kind: FocusRequest["kind"]) =>
      setFocusRequest((prev) => ({ kind, n: (prev?.n ?? 0) + 1 })),
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: write the debounced search box to the URL only when it differs
  useEffect(() => {
    if (query === state.q) return;
    const timer = setTimeout(() => update({ q: query }), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const available = run.available_viewports as Viewport[];
  const vp = (
    state.vp && available.includes(state.vp) ? state.vp : available[0]
  ) as Viewport | undefined;
  const overview = useOverview(run.id, vp);
  const findingsQuery = useFindings(run.id, vp);
  const decide = useDecideFinding(run.id, vp);
  const since = useDelta(run.id, !embedded && !!vp);
  const rerun = useRunAgain(run, (id) => router.push(`/runs/${id}`));

  const all = findingsQuery.data ?? [];
  const filtered = useMemo(() => applyFilters(all, state), [all, state]);
  const visible = useMemo(() => readingOrder(filtered), [filtered]);
  const selected = visible.find((f) => f.key === state.f) ?? null;
  const selectedIndex = selected ? visible.indexOf(selected) : -1;
  const selectedKeyNow = selected?.key;
  const counts = useMemo(() => {
    const out: Record<string, ReturnType<typeof countBySev>> = {};
    for (const sc of SC_LIST)
      out[sc] = countBySev(
        applyFilters(all, { ...state, sc: [] }).filter((f) => f.sc === sc),
      );
    return out;
  }, [all, state]);
  const coverage = overview.data?.coverage ?? [];
  const summary = useMemo(() => tallyOf(all, coverage), [all, coverage]);

  const resetDecision = decide.reset;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a save error belongs to the finding it happened on
  useEffect(() => resetDecision(), [selectedKeyNow]);

  const select = useCallback(
    (key: string | null) => {
      update({ f: key });
      const target = key ? visible.find((f) => f.key === key) : null;
      if (key) originKey.current = key;
      if (target)
        announce(
          selectionMessage(target, visible.indexOf(target), visible.length),
        );
      else announce("Selection cleared");
      if (key && !medium) {
        setTab("detail");
        requestFocus("detail");
      }
      setPairMode("page");
    },
    [update, visible, announce, medium, requestFocus],
  );

  const onFilter = useCallback(
    (patch: Partial<ReportState>) => {
      update(patch);
      announce(filterMessage(applyFilters(all, { ...state, ...patch }).length));
    },
    [update, announce, all, state],
  );

  useEffect(() => {
    if (!focusRequest) return;
    const done = () => setFocusRequest(null);
    if (focusRequest.kind === "detail")
      return focusWhenReady(
        () => (selectedKeyNow ? document.getElementById("detail-h") : null),
        done,
      );
    if (focusRequest.kind === "table")
      return focusWhenReady(
        () => document.getElementById("findings-table"),
        done,
      );
    return focusWhenReady(() => {
      const el = originElement(originKey.current);
      return el?.closest("[inert]") ? null : el;
    }, done);
  }, [focusRequest, selectedKeyNow]);

  const step = useCallback(
    (delta: number) => {
      const next = cycle(
        visible,
        selectedIndex < 0 ? (delta > 0 ? -1 : 0) : selectedIndex,
        delta,
      );
      if (next) select(next.key);
    },
    [visible, selectedIndex, select],
  );

  useEffect(() => {
    if (!shortcuts) return;
    function onKey(event: KeyboardEvent) {
      if (
        isTyping(event.target) ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !workspace.current?.contains(event.target as Node | null) ||
        (event.target as HTMLElement | null)?.closest?.(
          "[role=menu], [role=dialog], [role=alertdialog], [role=listbox]",
        )
      )
        return;
      if (event.key === "j" || event.key === "J") step(1);
      else if (event.key === "k" || event.key === "K") step(-1);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, shortcuts]);

  const source = sourceParts(run.source_kind, run.source, overview.data?.url);
  const subject =
    run.source_kind === "url"
      ? run.source
      : overview.data?.url || run.source.split("/").slice(-1)[0];

  if (!vp || findingsQuery.isError || overview.isError) {
    return (
      <div className="mx-auto max-w-160 px-6 py-12">
        {embedded ? null : <title>{`Report - ${subject}`}</title>}
        {embedded ? (
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="t-section text-ink outline-none"
          >
            The report could not be shown
          </h2>
        ) : (
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="t-page text-ink outline-none"
          >
            The report could not be shown
          </h1>
        )}
        <p className="mt-2 text-body text-ink-2">
          {run.error ?? "The findings for this run could not be loaded."}
        </p>
        {run.error ? (
          <Collapsible className="mt-3">
            <CollapsibleTrigger className="min-h-6 text-body underline underline-offset-4">
              Show details
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre
                tabIndex={0}
                className="mt-2 overflow-auto rounded-md border border-line bg-subtle p-2 font-mono text-xs"
              >
                {run.error}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    );
  }

  const loading = overview.isPending || findingsQuery.isPending;
  const checkedCount = coverage.filter(
    (c) =>
      c.hybrid_verdict === "automated" || c.hybrid_verdict === "needs-review",
  ).length;
  const rail = (
    <CriteriaRail
      findings={all}
      visible={visible}
      counts={counts}
      coverage={coverage}
      active={state.sc.length === 1 ? state.sc[0] : null}
      selectedKey={selected?.key ?? null}
      query={query}
      groupBy={groupBy}
      total={visible.length}
      onQuery={setQuery}
      onGroupBy={setGroupBy}
      onSelectCriterion={(sc) => {
        onFilter({ sc: sc ? [sc] : [], f: null });
        if (!medium) setTab("canvas");
      }}
      onSelectFinding={select}
      onEnterCanvas={() => document.getElementById("canvas-region")?.focus()}
    />
  );

  const detail = (
    <DetailPane
      runId={run.id}
      finding={selected}
      index={selectedIndex}
      total={visible.length}
      onPrev={() => step(-1)}
      onNext={() => step(1)}
      shortcuts={shortcuts}
      onAnnounce={announce}
      onBack={
        medium
          ? undefined
          : () => {
              setTab("canvas");
              requestFocus("origin");
            }
      }
      onDecide={(vars) => {
        if (!selected) return;
        announce(decisionMessage(vars));
        decide.mutate({ id: selected.id, ...vars });
      }}
      saveError={decide.isError}
      empty={visible.length === 0}
    />
  );

  const main = loading ? (
    <div className="p-4" aria-busy="true">
      <Skeleton className="h-96 w-full" />
    </div>
  ) : state.view === "table" ? (
    <FindingsTable
      findings={visible}
      state={state}
      selectedKey={selected?.key ?? null}
      onSelect={(key) => select(key)}
      onFilter={onFilter}
    />
  ) : (
    <div className="relative h-full">
      <Canvas
        runId={run.id}
        viewport={vp}
        url={embedded ? "the task page" : (overview.data?.url ?? subject)}
        size={{
          w: overview.data?.screenshot_width ?? 1,
          h: overview.data?.screenshot_height ?? 1,
        }}
        findings={visible}
        selectedKey={selected?.key ?? null}
        onSelect={select}
        pairMode={pairMode}
        onPairMode={setPairMode}
        focusStops={overview.data?.focus_stops ?? 0}
        onAnnounce={announce}
      />
      {all.length === 0 ? (
        <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-md">
          <p className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface p-3 text-body text-ink shadow-float">
            <StatusShape kind="pass" className="mt-1" />
            <span>
              {checkedCount === 8
                ? "No violations found in the 8 in-scope criteria."
                : `No violations found in the ${checkedCount} of 8 criteria this report checks. The other ${8 - checkedCount} were not assessed, so this is not a clean result for them.`}{" "}
              {embedded ? "" : "The coverage view shows what was checked."}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );

  const banner =
    run.status === "partial" && !embedded ? (
      <Alert className="mt-4">
        <AlertTitle>
          {available.length === 1
            ? `${available[0] === "desktop" ? "Mobile" : "Desktop"} capture failed`
            : "Part of this audit failed"}
        </AlertTitle>
        <AlertDescription>{run.error}</AlertDescription>
        {run.source_kind !== "upload" ? (
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => rerun.mutate()}
              disabled={rerun.isPending}
            >
              Retry
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    ) : null;

  const skipClass =
    "sr-only focus-visible:not-sr-only focus-visible:rounded-md focus-visible:border focus-visible:border-line focus-visible:bg-surface focus-visible:px-2 focus-visible:py-1";
  const skip = embedded ? null : (
    <div className="absolute top-0 left-0 z-30 flex gap-2">
      <a href="#canvas-region" className={skipClass}>
        Skip to canvas
      </a>
      <button
        type="button"
        className={skipClass}
        onClick={() => {
          update({ view: "table" });
          requestFocus("table");
        }}
      >
        Skip to findings table
      </button>
    </div>
  );

  const layout = wide ? (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel
        defaultSize="17rem"
        minSize="15rem"
        maxSize="28rem"
        groupResizeBehavior="preserve-pixel-size"
      >
        {rail}
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Resize criteria rail" />
      <ResizablePanel minSize={400}>
        <section
          id="canvas-region"
          tabIndex={-1}
          aria-label="Findings view"
          className="h-full outline-none"
        >
          {main}
        </section>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Resize detail pane" />
      <ResizablePanel
        defaultSize="23rem"
        minSize="20rem"
        maxSize="40rem"
        groupResizeBehavior="preserve-pixel-size"
      >
        <aside aria-label="Finding detail" className="h-full">
          {detail}
        </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : medium ? (
    <div className="grid min-h-0 flex-1 grid-cols-[18rem_1fr]">
      <div className="min-h-0 border-r border-line">{rail}</div>
      <section
        id="canvas-region"
        tabIndex={-1}
        aria-label="Findings view"
        className="min-h-0 outline-none"
      >
        {main}
      </section>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (open) return;
          select(null);
          requestFocus("origin");
        }}
      >
        <SheetContent
          side="right"
          aria-labelledby="detail-h"
          initialFocus={() => document.getElementById("detail-h")}
          finalFocus={false}
          className="w-[380px] max-w-full p-0 sm:max-w-[380px]"
        >
          <div className="h-full">{detail}</div>
        </SheetContent>
      </Sheet>
    </div>
  ) : (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(String(v))}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList className="mx-3 mt-2 w-auto">
        <TabsTrigger value="criteria">Criteria</TabsTrigger>
        <TabsTrigger value="canvas">Canvas</TabsTrigger>
        <TabsTrigger value="detail">Detail</TabsTrigger>
      </TabsList>
      <TabsContent value="criteria" className="min-h-0 flex-1">
        {rail}
      </TabsContent>
      <TabsContent value="canvas" className="min-h-0 flex-1">
        <section
          id="canvas-region"
          tabIndex={-1}
          aria-label="Findings view"
          className="h-full outline-none"
        >
          {main}
        </section>
      </TabsContent>
      <TabsContent value="detail" className="min-h-0 flex-1">
        <aside aria-label="Finding detail" className="h-full">
          {detail}
        </aside>
      </TabsContent>
    </Tabs>
  );

  const body = (
    <div ref={workspace} className="flex min-h-0 flex-1 flex-col">
      {layout}
    </div>
  );

  const statusRegion = (
    <div
      role="status"
      aria-live="polite"
      data-testid="report-status"
      className="sr-only"
    >
      {message}
    </div>
  );
  const inertWhileSheet = !wide && medium && !!selected;

  if (embedded) {
    return (
      <div className={`relative flex ${className} flex-col`}>
        {statusRegion}
        <div className="flex min-h-0 flex-1 flex-col" inert={inertWhileSheet}>
          <EmbeddedBar
            subject="Task page"
            condition={run.condition}
            viewport={vp}
            viewports={available}
            view={state.view}
            headingRef={headingRef}
            onViewport={(next) => update({ vp: next, f: null })}
            onView={(view) => update({ view })}
          />
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <title>{`Report - ${subject}`}</title>
      <PageCrumbs
        items={[{ label: "Audits", href: "/audits" }, { label: source.host }]}
      />
      <WideContent />
      {statusRegion}
      {skip}
      <div inert={inertWhileSheet}>
        <ReportHeader
          runId={run.id}
          source={source}
          createdAt={run.created_at}
          condition={run.condition}
          viewport={vp}
          viewports={available}
          headingRef={headingRef}
          canRerun={run.source_kind !== "upload"}
          rerunning={rerun.isPending}
          rerunFailed={rerun.isError}
          onViewport={(next) => update({ vp: next, f: null })}
          onRerun={() => rerun.mutate()}
        />
        <ViewTabs runId={run.id} state={state} viewport={vp} />
        {banner}
        {loading ? (
          <Panel className="mt-4 p-4" aria-busy="true">
            <Skeleton className="h-28 w-full" />
          </Panel>
        ) : (
          <SummaryPanel
            tally={summary}
            viewport={vp}
            delta={{
              data: since.data,
              pending: since.isPending,
              error: since.isError,
            }}
          />
        )}
        <Panel
          as="div"
          className="mt-4 flex h-[max(40rem,calc(100dvh-7rem))] max-h-[56.25rem] flex-col overflow-hidden"
        >
          {body}
        </Panel>
      </div>
    </div>
  );
}

export type { Finding };
