import { Suspense } from "react";
import { StudyRunner } from "@/components/study/study-runner";
import { Skeleton } from "@/components/ui/skeleton";

async function Body({ params }: PageProps<"/study/[code]">) {
  const { code } = await params;
  return <StudyRunner code={decodeURIComponent(code)} />;
}

export default function StudyCodePage(props: PageProps<"/study/[code]">) {
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
