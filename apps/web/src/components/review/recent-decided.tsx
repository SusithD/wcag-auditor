"use client";

import { Panel, ScCode, Status } from "@/components/ds";
import { siteLabel } from "@/components/sites/site-label";
import { Button } from "@/components/ui/button";
import {
  choiceWord,
  decisionOf,
  formatDecided,
  type ReviewItem,
} from "./review-model";

export function RecentDecided({
  items,
  onUndo,
  busy,
}: {
  items: ReviewItem[];
  onUndo: (item: ReviewItem) => void;
  busy: boolean;
}) {
  return (
    <section className="mt-6" aria-labelledby="recent-decided-h">
      <h2 id="recent-decided-h" className="t-section mb-2 text-ink">
        Recently decided
      </h2>
      <Panel as="div">
        {items.length === 0 ? (
          <p className="m-0 px-4 py-3 text-ink-2">
            Nothing has been decided yet. Decisions you save appear here, and
            you can undo them.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {items.map((item) => {
              const f = item.finding;
              const decision = decisionOf(f);
              return (
                <li
                  key={f.id}
                  className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 last:border-b-0"
                >
                  <Status
                    kind={
                      f.status === "confirmed"
                        ? "critical"
                        : f.status === "dismissed"
                          ? "done"
                          : "undecided"
                    }
                    strong
                    className="w-30"
                  >
                    {choiceWord(f.status)}
                  </Status>
                  <span className="min-w-0">
                    <ScCode code={f.sc} />{" "}
                    <span className="font-medium">
                      {f.guidance?.sc_title ?? "Finding"}
                    </span>
                  </span>
                  <span className="text-dense text-ink-3">
                    {siteLabel(item.site)}
                  </span>
                  {decision.reason ? (
                    <span className="text-dense text-ink-3">
                      {decision.reason}
                    </span>
                  ) : null}
                  <span className="ml-auto text-dense text-ink-3">
                    Decided by {decision.decided_by ?? "unknown"},{" "}
                    {formatDecided(decision.decided_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onUndo(item)}
                    aria-label={`Undo decision on ${f.sc} ${f.guidance?.sc_title ?? "finding"}, ${siteLabel(item.site)}`}
                  >
                    Undo
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </section>
  );
}
