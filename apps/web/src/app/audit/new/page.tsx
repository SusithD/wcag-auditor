import { NewAuditForm } from "@/components/audit/new-audit-form";
import { RecentRuns } from "@/components/audit/recent-runs";
import { PageHeader } from "@/components/ds";
import { PageTitle } from "@/components/page-title";
import { PageCrumbs } from "@/components/shell/shell-context";

export default function NewAuditPage() {
  return (
    <div className="max-w-[760px]">
      <PageTitle title="New audit - WCAG Auditor" />
      <PageCrumbs
        items={[{ label: "Overview", href: "/" }, { label: "New audit" }]}
      />
      <PageHeader
        title="New audit"
        description="We open the page in Chromium, capture it at the sizes you choose, and check 8 WCAG 2.2 criteria."
        className="mb-4"
      />
      <NewAuditForm />
      <RecentRuns />
      <p className="mt-6 text-dense text-ink-3">
        This tool checks 8 of the 86 WCAG 2.2 success criteria. Results are not
        a conformance claim.
      </p>
    </div>
  );
}
