import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CoverageScreen } from "@/components/views/coverage-screen";

async function Body({ params }: PageProps<"/runs/[id]/coverage">) {
  const { id } = await params;
  return <CoverageScreen runId={id} />;
}

export default function CoveragePage(props: PageProps<"/runs/[id]/coverage">) {
  return (
    <Suspense
      fallback={
        <div className="p-6" aria-busy="true">
          <Skeleton className="h-8 w-64" />
        </div>
      }
    >
      <Body {...props} />
    </Suspense>
  );
}
