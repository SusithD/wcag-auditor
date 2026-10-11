import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-160 px-6 py-12">
      <PageTitle title="Page not found - WCAG Auditor" />
      <h1 className="text-h1 font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-body text-muted-foreground">
        That address does not match a page in this app. Check it for typing
        mistakes, or go back to the start.
      </p>
      <Link href="/" className={`${buttonVariants()} mt-6`}>
        Back to New audit
      </Link>
    </div>
  );
}
