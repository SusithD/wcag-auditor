import { Suspense } from "react";
import { AuditsScreen } from "@/components/audits/audits-screen";
import { PageTitle } from "@/components/page-title";

export default function Page() {
  return (
    <>
      <PageTitle title="Audits - WCAG Auditor" />
      <Suspense fallback={null}>
        <AuditsScreen />
      </Suspense>
    </>
  );
}
