import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ds";
import { PageTitle } from "@/components/page-title";
import { buttonVariants } from "@/components/ui/button";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <PageTitle title={`${title} - WCAG Auditor`} />
      <PageHeader title={title} description={description} />
      <EmptyState
        title="This screen is being built"
        action={
          <Link
            href="/audit/new"
            className={buttonVariants({ variant: "primary" })}
          >
            New audit
          </Link>
        }
      >
        It will appear here in an upcoming update. You can start an audit in the
        meantime.
      </EmptyState>
    </>
  );
}
