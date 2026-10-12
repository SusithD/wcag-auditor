import { Suspense } from "react";
import { PageTitle } from "@/components/page-title";
import { ReviewScreen } from "@/components/review/review-screen";

export default function Page() {
  return (
    <>
      <PageTitle title="Review queue - WCAG Auditor" />
      <Suspense fallback={null}>
        <ReviewScreen />
      </Suspense>
    </>
  );
}
