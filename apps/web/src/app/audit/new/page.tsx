import { NewAuditForm } from "@/components/audit/new-audit-form";
import { PageHeader } from "@/components/ds";
import { PageTitle } from "@/components/page-title";

export default function NewAuditPage() {
  return (
    <div className="mx-auto w-full max-w-160">
      <PageTitle title="New audit - WCAG Auditor" />
      <PageHeader
        title="New audit"
        description="Check a page against WCAG 2.2 from its address or from screenshots."
      />
      <NewAuditForm />
    </div>
  );
}
