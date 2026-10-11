import { NewAuditForm } from "@/components/audit/new-audit-form";
import { RecentRuns } from "@/components/audit/recent-runs";
import { PageTitle } from "@/components/page-title";

export default function Home() {
  return (
    <div className="mx-auto mt-[8vh] w-full max-w-160 pb-16">
      <PageTitle title="New audit - WCAG Auditor" />
      <h1 className="text-h1 font-semibold tracking-tight">New audit</h1>
      <p className="mb-6 mt-1 text-body text-muted-foreground">
        Check a page against WCAG 2.2 from its address or from screenshots.
      </p>
      <NewAuditForm />
      <RecentRuns />
    </div>
  );
}
