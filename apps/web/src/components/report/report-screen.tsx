"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  compareFindings,
  countBySev,
  cycle,
  type Finding,
  SC_LIST,
  type Viewport,
} from "@/lib/report";
import { Canvas } from "./canvas";
import { CriteriaRail } from "./criteria-rail";
import { DetailPane } from "./detail-pane";
import { FindingsTable } from "./findings-table";
import type { PairMode } from "./focus-pair";
import { TopBar } from "./top-bar";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}

export function ReportScreen({
  run,
  headingRef,
  embedded = false,
  className = "h-[calc(100dvh-3rem)]",
}: {
  run: RunSummary;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  embedded?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { state, update } = useReportState();
  const wide = useMediaQuery("(min-width: 1280px)", true);
  const medium = useMediaQuery("(min-width: 1024px)", true);
  const [pairMode, setPairMode] = useState<PairMode>("page");
  const [tab, setTab] = useState("canvas");
  const [query, setQuery] = useState(state.q);

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
  const visible = useMemo(
    () => applyFilters(all, state).sort(compareFindings),
    [all, state],
  );
  const selected = visible.find((f) => f.key === state.f) ?? null;
  const selectedIndex = selected ? visible.indexOf(selected) : -1;
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
      if (key) setTab("detail");
      setPairMode("page");
    },
    [update],
  );

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
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-h2 font-semibold outline-none"
        >
          The report could not be shown
        </h1>
        <p className="mt-2 text-body text-muted-foreground">
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
        update({ sc: sc ? [sc] : [], f: null });
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
      onFilter={(patch) => update(patch)}
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
    run.status === "partial" ? (
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

  const skip = (
    <div className="flex gap-2 px-4">
      <a
        href="#canvas-region"
        className="sr-only focus-visible:not-sr-only focus-visible:rounded-md focus-visible:bg-background focus-visible:px-2 focus-visible:py-1"
      >
        Skip to canvas
      </a>
      <button
        type="button"
        className="sr-only focus-visible:not-sr-only focus-visible:rounded-md focus-visible:bg-background focus-visible:px-2 focus-visible:py-1"
        onClick={() => {
          update({ view: "table" });
          requestAnimationFrame(() =>
            document.getElementById("findings-table")?.focus(),
          );
        }}
      >
        Skip to findings table
      </button>
    </div>
  );

  const body = wide ? (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel
        defaultSize={280}
        minSize={240}
        maxSize={420}
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
        defaultSize={380}
        minSize={320}
        maxSize={560}
        groupResizeBehavior="preserve-pixel-size"
      >
        <aside aria-label="Finding detail" className="h-full">
          {detail}
        </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : medium ? (
    <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
      <div className="min-h-0 border-r">{rail}</div>
      <section
        id="canvas-region"
        tabIndex={-1}
        aria-label="Findings view"
        className="min-h-0 outline-none"
      >
        {main}
      </section>
      <Sheet open={!!selected} onOpenChange={(open) => !open && select(null)}>
        <SheetContent
          side="right"
          className="w-[380px] max-w-full p-0 sm:max-w-[380px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Finding details</SheetTitle>
          </SheetHeader>
          <aside aria-label="Finding detail" className="h-full">
            {detail}
          </aside>
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

  return (
    <div className={`flex ${className} flex-col`}>
      {skip}
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
  );
}

export type { Finding };
