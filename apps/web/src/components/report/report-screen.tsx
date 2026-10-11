"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type RunSummary } from "@/api/client";
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
import {
  useFindings,
  useOverview,
  useSetStatus,
} from "@/hooks/use-report-data";
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
import { TopBar } from "./top-bar";

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
  const queryClient = useQueryClient();
  const { state, update } = useReportState();
  const wide = useMediaQuery(
    embedded ? "(min-width: 1760px)" : "(min-width: 1280px)",
    true,
  );
  const medium = useMediaQuery("(min-width: 1024px)", true);
  const [pairMode, setPairMode] = useState<PairMode>("page");
  const [tab, setTab] = useState("canvas");
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
  const setStatus = useSetStatus(run.id, vp);

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
  }, [step]);

  const retry = useMutation({
    mutationFn: async () => {
      const base = { condition: run.condition, max_focus_steps: 15 };
      const body =
        run.source_kind === "url"
          ? { ...base, url: run.source, viewports: run.viewports }
          : run.source_kind === "folder"
            ? { ...base, folder: run.source }
            : null;
      if (!body) throw new Error("This source cannot be retried");
      const { data, error } = await api.POST("/runs", { body });
      if (error || !data) throw new Error("Retry failed");
      return data.run_id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
      router.push(`/runs/${id}`);
    },
  });

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
            className="text-h2 font-semibold outline-none"
          >
            The report could not be shown
          </h2>
        ) : (
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-h2 font-semibold outline-none"
          >
            The report could not be shown
          </h1>
        )}
        <p className="mt-2 text-body text-muted-foreground">
          {run.error ?? "The findings for this run could not be loaded."}
        </p>
        {run.error ? (
          <Collapsible className="mt-3">
            <CollapsibleTrigger className="min-h-[24px] text-body underline underline-offset-4">
              Show details
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre
                tabIndex={0}
                className="mt-2 overflow-auto rounded-md border bg-muted p-2 font-mono text-label"
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
  const checkedCount = (overview.data?.coverage ?? []).filter(
    (c) =>
      c.hybrid_verdict === "automated" || c.hybrid_verdict === "needs-review",
  ).length;
  const rail = (
    <CriteriaRail
      counts={counts}
      coverage={overview.data?.coverage ?? []}
      active={state.sc.length === 1 ? state.sc[0] : null}
      query={query}
      total={visible.length}
      onQuery={setQuery}
      onSelect={(sc) => {
        onFilter({ sc: sc ? [sc] : [], f: null });
        if (!medium) setTab("canvas");
      }}
      onEnterCanvas={() => document.getElementById("canvas-region")?.focus()}
    />
  );

  const detailIndex = selectedIndex;
  const saveFailed = setStatus.isError;
  const detail = (
    <DetailPane
      runId={run.id}
      finding={selected}
      index={detailIndex}
      total={visible.length}
      onPrev={() => step(-1)}
      onNext={() => step(1)}
      onAnnounce={announce}
      onBack={
        medium
          ? undefined
          : () => {
              setTab("canvas");
              requestFocus("origin");
            }
      }
      onStatus={(status) =>
        selected && setStatus.mutate({ id: selected.id, status })
      }
      saving={setStatus.isPending}
      saveError={saveFailed}
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
        <div className="pointer-events-none absolute inset-3 rounded-lg border-2 border-emerald-600 motion-safe:animate-[pulse_1.2s_ease-in-out_1] dark:border-emerald-400">
          <p className="pointer-events-auto m-4 inline-block rounded-md bg-background p-3 text-body">
            {checkedCount === 8
              ? "No violations found in the 8 in-scope criteria."
              : `No violations found in the ${checkedCount} of 8 criteria this report checks. The other ${8 - checkedCount} were not assessed, so this is not a clean result for them.`}{" "}
            {embedded ? "" : "The coverage view shows what was checked."}
          </p>
        </div>
      ) : null}
    </div>
  );

  const banner =
    run.status === "partial" && !embedded ? (
      <Alert className="m-3">
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
              onClick={() => retry.mutate()}
              disabled={retry.isPending}
            >
              Retry
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    ) : null;

  const skipClass =
    "sr-only focus-visible:not-sr-only focus-visible:rounded-md focus-visible:border focus-visible:bg-background focus-visible:px-2 focus-visible:py-1";
  const skip = embedded ? null : (
    <div className="absolute left-4 top-1 z-30 flex gap-2">
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
        defaultSize="21.5rem"
        minSize="18.5rem"
        maxSize="32.5rem"
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
        defaultSize="29rem"
        minSize="24.5rem"
        maxSize="43rem"
        groupResizeBehavior="preserve-pixel-size"
      >
        <aside aria-label="Finding detail" className="h-full">
          {detail}
        </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : medium ? (
    <div className="grid min-h-0 flex-1 grid-cols-[21.5rem_1fr]">
      <div className="min-h-0 border-r">{rail}</div>
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
      <TabsList className="mx-3 mt-2">
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

  return (
    <div className={`relative flex ${className} flex-col`}>
      {embedded ? null : <title>{`Report - ${subject}`}</title>}
      <div
        role="status"
        aria-live="polite"
        data-testid="report-status"
        className="sr-only"
      >
        {message}
      </div>
      {skip}
      <div
        className="flex min-h-0 flex-1 flex-col"
        inert={!wide && medium && !!selected}
      >
        <TopBar
          runId={run.id}
          subject={embedded ? "Task page" : subject}
          embedded={embedded}
          condition={run.condition}
          viewport={vp}
          viewports={available}
          view={state.view}
          headingRef={headingRef}
          onViewport={(next) => update({ vp: next, f: null })}
          onView={(view) => update({ view })}
        />
        {banner}
        {body}
      </div>
    </div>
  );
}

export type { Finding };
