"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api/client";
import { FilterSelect } from "@/components/audits/filter-select";
import { EmptyState, PageHeader, Panel, Status } from "@/components/ds";
import { useSites } from "@/components/overview/use-overview";
import { useSettings } from "@/components/settings/use-settings";
import { WideContent } from "@/components/shell";
import { siteLabel } from "@/components/sites/site-label";
import { buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RecentDecided } from "./recent-decided";
import { ReviewDetail } from "./review-detail";
import { ReviewList } from "./review-list";
import {
  type Choice,
  CRITERIA_OPTIONS,
  choiceOf,
  choiceWord,
  decisionOf,
  groupByReason,
  isTypingTarget,
  nextIndex,
  type QueueState,
  type ReviewItem,
  reasonTitle,
} from "./review-model";

const STATES: { value: QueueState; label: string }[] = [
  { value: "waiting", label: "Waiting" },
  { value: "decided", label: "Decided" },
  { value: "all", label: "All" },
];

type Patch = {
  status: "open" | "confirmed" | "dismissed" | "unsure";
  reason?: string;
  note?: string;
};

function describe(item: ReviewItem) {
  return `${item.finding.sc} on ${siteLabel(item.site)}`;
}

export function ReviewScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [settings] = useSettings();

  const rawState = params.get("state");
  const state: QueueState =
    rawState === "decided" || rawState === "all" ? rawState : "waiting";
  const site = params.get("site") ?? "";
  const sc = params.get("sc") ?? "";
  const reason = params.get("reason") ?? "";
  const urlSelected = Number(params.get("f")) || null;

  const review = useQuery({
    queryKey: ["review", state, site, sc, reason],
    queryFn: async () => {
      const { data, error } = await api.GET("/review", {
        params: {
          query: {
            state,
            site: site || null,
            sc: sc || null,
            reason: reason || null,
            limit: 500,
          },
        },
      });
      if (error || !data) throw new Error("Could not load the review queue");
      return data;
    },
  });
  const decidedQuery = useQuery({
    queryKey: ["review", "recent"],
    queryFn: async () => {
      const { data, error } = await api.GET("/review", {
        params: { query: { state: "decided", limit: 500 } },
      });
      if (error || !data) throw new Error("Could not load decisions");
      return data;
    },
  });
  const sites = useSites();

  const items = review.data?.items ?? [];
  const groups = useMemo(
    () => groupByReason(items, review.data?.counts_by_reason ?? []),
    [items, review.data?.counts_by_reason],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const selected =
    flat.find((i) => i.finding.id === urlSelected) ?? flat[0] ?? null;
  const selectedId = selected?.finding.id ?? null;
  const selectedIndex = flat.findIndex((i) => i.finding.id === selectedId);

  const recent = useMemo(
    () =>
      [...(decidedQuery.data?.items ?? [])]
        .filter((i) => decisionOf(i.finding).decided_at)
        .sort((a, b) =>
          String(decisionOf(b.finding).decided_at).localeCompare(
            String(decisionOf(a.finding).decided_at),
          ),
        )
        .slice(0, 5),
    [decidedQuery.data],
  );

  const [groupOverride, setGroupOverride] = useState<Record<string, boolean>>(
    {},
  );
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bulkReasonOpen, setBulkReasonOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const radioRefs = useRef<Record<Choice, HTMLInputElement | null>>({
    confirmed: null,
    dismissed: null,
    unsure: null,
  });
  const reasonRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);

  const selectedStatus = selected?.finding.status ?? "";
  const selectedReason = selected ? decisionOf(selected.finding).reason : "";
  const selectedNote = selected ? decisionOf(selected.finding).note : "";
  useEffect(() => {
    if (selectedId === null) return;
    setChoice(choiceOf(selectedStatus));
    setDismissReason(selectedReason ?? "");
    setNote(selectedNote ?? "");
    setFormError(null);
  }, [selectedId, selectedStatus, selectedReason, selectedNote]);

  const groupOpen = useCallback(
    (key: string, index: number) => {
      const override = groupOverride[key];
      if (override !== undefined) return override;
      const holdsSelection =
        selected && (selected.finding.needs_review_reason ?? "") === key;
      return index === 0 || Boolean(holdsSelection);
    },
    [groupOverride, selected],
  );
  const openKeys = useMemo(
    () =>
      new Set(groups.filter((g, i) => groupOpen(g.key, i)).map((g) => g.key)),
    [groups, groupOpen],
  );

  const setParams = useCallback(
    (patch: Record<string, string | null>, replace = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, pathname, router],
  );

  const select = useCallback(
    (id: number) => {
      setParams({ f: String(id) });
    },
    [setParams],
  );

  const move = useCallback(
    (delta: 1 | -1) => {
      const index = nextIndex(flat.length, selectedIndex, delta);
      const target = flat[index];
      if (!target) return;
      const key = target.finding.needs_review_reason ?? "";
      setGroupOverride((prev) => ({ ...prev, [key]: true }));
      select(target.finding.id);
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-finding-id="${target.finding.id}"]`)
          ?.scrollIntoView({ block: "nearest" }),
      );
    },
    [flat, selectedIndex, select],
  );

  const choose = useCallback((next: Choice) => {
    setChoice(next);
    setFormError(null);
    requestAnimationFrame(() => radioRefs.current[next]?.focus());
  }, []);

  useEffect(() => {
    if (!settings.shortcuts) return;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (!selected && !["j", "k"].includes(event.key.toLowerCase())) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === "j") move(1);
      else if (key === "k") move(-1);
      else if (key === "c") choose("confirmed");
      else if (key === "x") choose("dismissed");
      else if (key === "u") choose("unsure");
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.shortcuts, move, choose, selected]);

  async function patchMany(ids: number[], body: Patch) {
    const results = await Promise.all(
      ids.map((id) =>
        api
          .PATCH("/findings/{finding_id}", {
            params: { path: { finding_id: id } },
            body,
          })
          .then(({ error }) => !error)
          .catch(() => false),
      ),
    );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["review"] }),
      queryClient.invalidateQueries({ queryKey: ["sites"] }),
      queryClient.invalidateQueries({ queryKey: ["summary"] }),
    ]).catch(() => undefined);
    return results.filter(Boolean).length;
  }

  function focusDetail() {
    requestAnimationFrame(() => {
      const target = headingRef.current ?? emptyRef.current;
      target?.focus();
    });
  }

  async function save() {
    if (!selected || busy) return;
    if (!choice) {
      setFormError("Choose a decision before saving.");
      radioRefs.current.confirmed?.focus();
      return;
    }
    if (choice === "dismissed" && !dismissReason) {
      setFormError("Choose a reason for dismissing.");
      requestAnimationFrame(() =>
        reasonRef.current?.querySelector("button")?.focus(),
      );
      return;
    }
    setBusy(true);
    setFormError(null);
    setActionError(null);
    let ok = 0;
    try {
      ok = await patchMany([selected.finding.id], {
        status: choice,
        reason: choice === "dismissed" ? dismissReason : undefined,
        note: note.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
    if (!ok) {
      setFormError("The decision could not be saved. Try again.");
      return;
    }
    const leaves = state === "waiting" && choice !== "unsure";
    const neighbour = leaves
      ? (flat[selectedIndex + 1] ?? flat[selectedIndex - 1])
      : flat[selectedIndex + 1];
    const remaining = leaves ? flat.length - 1 : flat.length;
    setMessage(
      `Saved: ${choiceWord(choice)} for ${describe(selected)}. ${
        remaining === 0
          ? "The queue is empty."
          : `${remaining} ${state === "waiting" ? "waiting" : "in view"}.`
      }`,
    );
    if (neighbour) select(neighbour.finding.id);
    focusDetail();
  }

  async function undo(item: ReviewItem) {
    setBusy(true);
    setActionError(null);
    let ok = 0;
    try {
      ok = await patchMany([item.finding.id], { status: "open" });
    } finally {
      setBusy(false);
    }
    if (ok) {
      setMessage(
        `Decision undone for ${describe(item)}. It is back in the queue.`,
      );
    } else {
      setActionError(
        `The decision on ${describe(item)} could not be undone. Try again.`,
      );
    }
  }

  async function bulk(body: Patch) {
    const ids = [...checked].filter((id) =>
      items.some((i) => i.finding.id === id),
    );
    if (ids.length === 0) return;
    setBusy(true);
    setActionError(null);
    let ok = 0;
    try {
      ok = await patchMany(ids, body);
    } finally {
      setBusy(false);
    }
    setChecked(new Set());
    setBulkReasonOpen(false);
    if (ok === ids.length) {
      setMessage(
        `${ok} findings marked ${choiceWord(body.status).toLowerCase()}.`,
      );
    } else {
      setActionError(
        `${ok} of ${ids.length} findings were saved. The rest failed; try those again.`,
      );
    }
  }

  const siteOptions = [
    { value: "", label: "All" },
    ...(sites.data ?? []).map((row) => ({
      value: row.site,
      label: siteLabel(row.site),
    })),
  ];
  const reasonOptions = [
    { value: "", label: "All" },
    ...(review.data?.counts_by_reason ?? [])
      .filter((r) => r.reason)
      .map((r) => ({
        value: r.reason as string,
        label: reasonTitle(r.reason),
      })),
  ];

  const checkedVisible = new Set(
    [...checked].filter((id) => items.some((i) => i.finding.id === id)),
  );
  const filtered = Boolean(site || sc || reason);
  const total = review.data?.total ?? 0;

  return (
    <>
      <WideContent />
      <PageHeader
        title="Review queue"
        description={
          <span className="block max-w-md">
            Findings marked Needs review. A person needs to check each one.
          </span>
        }
        actions={
          <div
            role="group"
            aria-label="Filters"
            className="flex flex-wrap items-center gap-2"
          >
            <FilterSelect
              label="Site"
              value={site}
              onChange={(v) => setParams({ site: v || null, f: null })}
              options={siteOptions}
            />
            <FilterSelect
              label="Criterion"
              value={sc}
              onChange={(v) => setParams({ sc: v || null, f: null })}
              options={[{ value: "", label: "All" }, ...CRITERIA_OPTIONS]}
            />
            <FilterSelect
              label="Reason"
              value={reason}
              onChange={(v) => setParams({ reason: v || null, f: null })}
              options={reasonOptions}
            />
            <ToggleGroup
              variant="outline"
              value={[state]}
              onValueChange={(v) =>
                v[0] &&
                setParams({
                  state: v[0] === "waiting" ? null : v[0],
                  f: null,
                })
              }
              aria-label="Status"
            >
              {STATES.map((s) => (
                <ToggleGroupItem key={s.value} value={s.value}>
                  {s.label}
                  {s.value === state && review.data ? (
                    <span className="num ml-1">{total}</span>
                  ) : null}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        }
      />
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      {actionError ? (
        <p
          role="alert"
          className="mb-3 mt-0 flex items-center gap-2 text-dense font-medium"
        >
          <Status kind="critical">
            <span className="text-ink">{actionError}</span>
          </Status>
        </p>
      ) : null}

      {review.isPending ? (
        <Panel as="div">
          <p className="m-0 p-4 text-ink-2" aria-busy="true">
            Loading the review queue
          </p>
        </Panel>
      ) : review.isError ? (
        <Panel as="div">
          <EmptyState
            title="The review queue is unavailable"
            action={
              <button
                type="button"
                className={buttonVariants()}
                onClick={() => review.refetch()}
              >
                Try again
              </button>
            }
          >
            The audit service did not answer. Check that it is running, then try
            again.
          </EmptyState>
        </Panel>
      ) : !selected ? (
        <Panel as="div">
          <div
            id="review-empty"
            ref={emptyRef}
            tabIndex={-1}
            className="outline-none"
          >
            <EmptyState
              title={
                filtered
                  ? "Nothing matches these filters"
                  : state === "decided"
                    ? "Nothing has been decided yet"
                    : "Nothing is waiting for review"
              }
              action={
                filtered ? (
                  <button
                    type="button"
                    className={buttonVariants()}
                    onClick={() =>
                      setParams({ site: null, sc: null, reason: null, f: null })
                    }
                  >
                    Clear filters
                  </button>
                ) : (
                  <Link
                    href="/audit/new"
                    className={buttonVariants({ variant: "primary" })}
                  >
                    New audit
                  </Link>
                )
              }
            >
              {filtered
                ? "Change or clear a filter to see more findings."
                : "Every finding the tool could not settle has been decided. New ones appear here after your next audit."}
            </EmptyState>
          </div>
        </Panel>
      ) : (
        <Panel
          as="div"
          className="grid min-[901px]:h-[max(560px,calc(100vh-17rem))] min-[901px]:grid-cols-[minmax(320px,440px)_minmax(0,1fr)] min-[901px]:overflow-hidden"
        >
          <ReviewList
            groups={groups}
            openKeys={openKeys}
            onToggleGroup={(key) => {
              const index = groups.findIndex((g) => g.key === key);
              setGroupOverride((prev) => ({
                ...prev,
                [key]: !groupOpen(key, index),
              }));
            }}
            selectedId={selectedId}
            onSelect={select}
            checked={checkedVisible}
            onCheck={(id) =>
              setChecked((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onCheckGroup={(group) =>
              setChecked((prev) => {
                const next = new Set(prev);
                for (const i of group.items) next.add(i.finding.id);
                return next;
              })
            }
            bulkReasonOpen={bulkReasonOpen}
            onBulkConfirm={() => bulk({ status: "confirmed" })}
            onBulkDismissStart={() => setBulkReasonOpen((open) => !open)}
            onBulkDismiss={(r) => bulk({ status: "dismissed", reason: r })}
            onClear={() => {
              setChecked(new Set());
              setBulkReasonOpen(false);
            }}
            busy={busy}
          />
          <ReviewDetail
            item={selected}
            choice={choice}
            onChoice={(c) => {
              setChoice(c);
              setFormError(null);
            }}
            reason={dismissReason}
            onReason={(r) => {
              setDismissReason(r);
              setFormError(null);
            }}
            note={note}
            onNote={setNote}
            error={formError}
            onSave={save}
            saving={busy}
            shortcuts={settings.shortcuts}
            headingRef={headingRef}
            radioRefs={radioRefs}
            reasonRef={reasonRef}
          />
        </Panel>
      )}

      <RecentDecided items={recent} onUndo={undo} busy={busy} />
    </>
  );
}
