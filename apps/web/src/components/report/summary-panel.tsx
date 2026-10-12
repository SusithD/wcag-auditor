"use client";

import Link from "next/link";
import { Meter, Panel, SeverityCounts } from "@/components/ds";
import {
  type DeltaCounts,
  deltaCounts,
  deltaText,
  type Tally,
  verdictSentence,
} from "./logic";
import type { Delta } from "./use-report-queries";

type DeltaState = {
  data: Delta | undefined;
  pending: boolean;
  error: boolean;
};

function sinceText(state: DeltaState, viewport: string): string {
  if (state.pending) return "Comparing with the earlier audit";
  if (state.error || !state.data) return "The comparison is not available";
  if (!state.data.previous_run_id)
    return "No earlier audit of this page to compare with";
  const counts: DeltaCounts = deltaCounts(state.data, viewport);
  return deltaText(counts);
}

const CELL =
  "pt-3 pb-1 min-[1280px]:px-4 min-[1280px]:first:pl-0 min-[1280px]:border-r min-[1280px]:border-line min-[1280px]:last:border-r-0";

export function SummaryPanel({
  tally,
  delta,
  viewport,
}: {
  tally: Tally;
  delta: DeltaState;
  viewport: string;
}) {
  return (
    <Panel aria-labelledby="sum-h" className="mt-4 px-4 pt-4 pb-3">
      <h2 id="sum-h" className="sr-only">
        Summary
      </h2>
      <p
        data-testid="verdict"
        className="mb-3 text-[0.9375rem] leading-[1.375rem] text-ink-2"
      >
        {verdictSentence(tally).map((part, i) =>
          part.strong ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static ordered fragments
            <b key={i} className="font-semibold text-ink">
              {part.text}
            </b>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: static ordered fragments
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      <dl className="m-0 grid grid-cols-4 border-t border-line max-[1280px]:grid-cols-2 max-[720px]:grid-cols-1">
        <div className={CELL}>
          <dt className="mb-1.5 text-xs font-medium text-ink-3">Failures</dt>
          <dd className="m-0 flex items-center gap-3">
            <span className="num text-xl leading-7 font-semibold text-ink">
              {tally.failures}
            </span>
            <SeverityCounts
              critical={tally.critical}
              serious={tally.serious}
              minor={tally.minor}
            />
          </dd>
        </div>
        <div className={CELL}>
          <dt className="mb-1.5 text-xs font-medium text-ink-3">
            Needs review
          </dt>
          <dd className="m-0 flex items-center gap-3">
            <span className="num text-xl leading-7 font-semibold text-ink">
              {tally.review}
            </span>
            <span className="text-dense text-ink-3">
              findings to check by hand
            </span>
          </dd>
        </div>
        <div className={CELL}>
          <dt className="mb-1.5 text-xs font-medium text-ink-3">Criteria</dt>
          <dd className="m-0 flex flex-col items-start gap-1.5">
            <Meter
              className="w-40"
              decided={tally.decided}
              review={tally.reviewCriteria}
              undecided={tally.undecided}
            />
            <span className="text-dense text-ink-3">
              <span className="num">{tally.decided}</span> decided ·{" "}
              <span className="num">{tally.reviewCriteria}</span> to review ·{" "}
              <span className="num">{tally.undecided}</span> could not be
              decided
            </span>
          </dd>
        </div>
        <div className={CELL}>
          <dt className="mb-1.5 text-xs font-medium text-ink-3">
            Since last audit
          </dt>
          <dd
            className="m-0 min-h-9 text-dense text-ink-2"
            data-testid="since-last"
          >
            {sinceText(delta, viewport)}
          </dd>
        </div>
      </dl>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 text-dense text-ink-3">
        <span>This tool checks 8 of the 86 WCAG 2.2 success criteria.</span>
        <Link
          href="/help"
          className="inline-flex min-h-6 items-center font-medium text-accent underline underline-offset-2"
        >
          What this result does not mean
        </Link>
        {tally.dismissed > 0 ? (
          <span>
            {tally.dismissed} dismissed{" "}
            {tally.dismissed === 1 ? "finding is" : "findings are"} not counted.
          </span>
        ) : null}
      </p>
    </Panel>
  );
}
