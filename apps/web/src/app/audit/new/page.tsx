import { NewAuditForm } from "@/components/audit/new-audit-form";
import { RecentRuns } from "@/components/audit/recent-runs";
import { PageHeader } from "@/components/ds";
import { PageTitle } from "@/components/page-title";
import { PageCrumbs } from "@/components/shell/shell-context";

export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <div className="max-w-[760px]">
      <PageTitle title="New audit - WCAG Auditor" />
      <PageCrumbs
        items={[{ label: "Overview", href: "/" }, { label: "New audit" }]}
      />
      <PageHeader
        title="New audit"
        description="We open the page in Chromium and capture it at the sizes you choose. The tool checks 8 WCAG 2.2 criteria using browser rules and, if you choose it, an element detector."
        className="mb-4"
      />
      <NewAuditForm
        initialTab={tab === "screenshots" ? "screenshots" : "url"}
      />
      <RecentRuns />
      <p className="mt-6 text-dense text-ink-3">
        This tool checks 8 of the 86 WCAG 2.2 success criteria. Results are not
        a conformance claim.
      </p>
    </div>
  );
}
