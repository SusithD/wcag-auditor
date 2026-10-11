import { Suspense } from "react";
import { RunView } from "@/components/audit/run-view";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";

async function Body({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  return <RunView runId={id} />;
}

export default function RunPage(props: PageProps<"/runs/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="p-6" aria-busy="true">
          <PageTitle title="Audit - WCAG Auditor" />
          <Skeleton className="h-8 w-64" />
        </div>
      }
    >
      <Body {...props} />
    </Suspense>
  );
}
