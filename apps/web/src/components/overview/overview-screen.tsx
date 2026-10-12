"use client";

import { EmptyState, PageHeader } from "@/components/ds";
import { PageTitle } from "@/components/page-title";
import { PageCrumbs, WideContent } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { overviewSentence } from "@/lib/overview";
import { ContinueCards } from "./continue-cards";
import { FirstRun } from "./quick-audit";
import { MethodPanel, WeekPanel } from "./side-panels";
import { SitesTable } from "./sites-table";
import { useReviewSummary, useSites, useWeek } from "./use-overview";

const SCOPE = "8 of 86 WCAG 2.2 criteria checked. Not a conformance claim.";

function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <p className="sr-only">Loading the overview</p>
      <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1">
        <Skeleton className="h-46" />
        <Skeleton className="h-46" />
        <Skeleton className="h-46 max-[1100px]:hidden" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export function OverviewScreen() {
  const sites = useSites();
  const week = useWeek();
  const review = useReviewSummary();

  let body: React.ReactNode;
  let description: string | undefined;
  if (sites.isError) {
    body = (
      <EmptyState
        title="The overview could not be loaded"
        action={
          <Button type="button" onClick={() => void sites.refetch()}>
            Try again
          </Button>
        }
      >
        The audit service did not answer. Check that it is running, then try
        again.
      </EmptyState>
    );
  } else if (sites.isPending) {
    body = <Loading />;
  } else if (sites.data.length === 0) {
    body = <FirstRun />;
    description =
      "No audits yet. Run one to see your sites, findings and progress here.";
  } else {
    const running = week.data?.running.length ?? 0;
    const waiting = review.data?.total ?? 0;
    description =
      week.data && review.data
        ? overviewSentence(running, waiting)
        : "Your sites and their latest audits.";
    body = (
      <>
        <ContinueCards week={week.data} review={review.data} />
        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-4 max-[1100px]:grid-cols-1">
          <SitesTable rows={sites.data} />
          <div className="flex flex-col gap-4">
            {week.data ? <WeekPanel week={week.data} /> : null}
            <MethodPanel />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Overview - WCAG Auditor" />
      <PageCrumbs items={[{ label: "Overview" }]} />
      <WideContent />
      <PageHeader
        title="Overview"
        description={description}
        scope={sites.isSuccess && sites.data.length > 0 ? SCOPE : undefined}
      />
      {body}
    </>
  );
}
