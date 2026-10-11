import Link from "next/link";
import type { components } from "@/api/types";
import { Panel, QuietLink, Status } from "@/components/ds";
import { buttonVariants } from "@/components/ui/button";
import { plural, reasonLabel } from "@/lib/overview";
import { runLabel } from "@/lib/shell";

type Week = components["schemas"]["WeekSummary"];
type Review = components["schemas"]["ReviewOut"];

const CARD = "flex min-h-46 flex-col gap-2 p-4";
const TITLE = "t-section text-ink";
const TEXT = "m-0 text-dense text-ink-2";

function CardTop({
  status,
  note,
}: {
  status: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {status}
      {note ? <span className="text-dense text-ink-3">{note}</span> : null}
    </div>
  );
}

export function RunningCard({ running }: { running: Week["running"] }) {
  const first = running[0];
  const label = runLabel({
    source_kind: /^https?:/.test(first.source) ? "url" : "folder",
    source: first.source,
  });
  const more = running.length - 1;
  return (
    <Panel as="article" aria-label="Running audit" className={CARD}>
      <CardTop
        status={
          <Status kind="running" strong>
            {first.status === "queued" ? "Queued" : "Running"}
          </Status>
        }
        note={more > 0 ? `${more} more waiting` : undefined}
      />
      <h3 className={`${TITLE} break-words`}>{label}</h3>
      <p className={TEXT}>
        The audit keeps running if you leave. Open it to follow the steps.
      </p>
      <QuietLink
        href={`/runs/${first.run_id}`}
        className="-ml-2 mt-auto self-start"
      >
        View progress
      </QuietLink>
    </Panel>
  );
}

export function FixesCard({ fixes }: { fixes: Week["fixes_to_verify"] }) {
  return (
    <Panel as="article" aria-label="Fixes to verify" className={CARD}>
      <CardTop
        status={
          <Status kind="done" strong>
            Fixes to verify
          </Status>
        }
        note={plural(fixes.sites, "site")}
      />
      <h3 className={TITLE}>
        <span className="num">{fixes.findings}</span>{" "}
        {fixes.findings === 1 ? "finding" : "findings"} marked as fixed
      </h3>
      <p className={TEXT}>
        A fix counts once a new audit no longer finds the issue. Run the audits
        again to confirm.
      </p>
      <div className="mt-auto">
        <Link href="/sites" className={buttonVariants({ variant: "default" })}>
          Open sites
        </Link>
      </div>
    </Panel>
  );
}

export function ReviewCard({ review }: { review: Review }) {
  const top = review.counts_by_reason.slice(0, 3);
  return (
    <Panel as="article" aria-label="Review queue" className={CARD}>
      <CardTop
        status={
          <Status kind="review" strong>
            Review queue
          </Status>
        }
      />
      <h3 className={TITLE}>
        <span className="num">{review.total}</span>{" "}
        {review.total === 1 ? "finding needs" : "findings need"} a person
      </h3>
      <ul className="m-0 list-none p-0 text-dense">
        {top.map((item) => (
          <li
            key={item.reason ?? "none"}
            className="flex justify-between gap-3 border-b border-line py-1 text-ink-2 last:border-b-0"
          >
            <span>{reasonLabel(item.reason)}</span>
            <span className="num text-ink-3">{item.count}</span>
          </li>
        ))}
      </ul>
      <QuietLink href="/review" className="-ml-2 mt-auto self-start">
        Open queue
      </QuietLink>
    </Panel>
  );
}

export function ContinueCards({
  week,
  review,
}: {
  week: Week | undefined;
  review: Review | undefined;
}) {
  const showRunning = (week?.running.length ?? 0) > 0;
  const showFixes = (week?.fixes_to_verify.findings ?? 0) > 0;
  const showReview = (review?.total ?? 0) > 0;
  if (!showRunning && !showFixes && !showReview) return null;
  return (
    <section aria-labelledby="cont-h" className="mb-6">
      <h2 id="cont-h" className="t-eyebrow mb-2">
        Continue
      </h2>
      <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1">
        {showRunning && week ? <RunningCard running={week.running} /> : null}
        {showFixes && week ? <FixesCard fixes={week.fixes_to_verify} /> : null}
        {showReview && review ? <ReviewCard review={review} /> : null}
      </div>
    </section>
  );
}
