import Link from "next/link";
import { EmptyState } from "@/components/ds";
import { PageTitle } from "@/components/page-title";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <PageTitle title="Page not found - WCAG Auditor" />
      <EmptyState
        as="h1"
        className="py-16"
        title="Page not found"
        action={
          <Link href="/" className={buttonVariants({ variant: "primary" })}>
            Back to Overview
          </Link>
        }
      >
        That address does not match a page in this app. Check it for typing
        mistakes, or go back to the start.
      </EmptyState>
    </>
  );
}
