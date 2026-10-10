import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CompareScreen } from "@/components/views/compare-screen";

async function Body({ params }: PageProps<"/runs/[id]/compare">) {
  const { id } = await params;
  return <CompareScreen runId={id} />;
}

export default function ComparePage(props: PageProps<"/runs/[id]/compare">) {
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
