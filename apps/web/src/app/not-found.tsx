import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { PageCrumbs } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <PageTitle title="Page not found - WCAG Auditor" />
      <PageCrumbs items={[{ label: "Page not found" }]} />
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-16 text-center">
        <h1 className="t-page text-ink">Page not found</h1>
        <p className="text-ink-2">
          That address does not match a page in this app. The address may be
          incomplete. Go back to the start.
        </p>
        <div className="mt-2">
          <Link href="/" className={buttonVariants({ variant: "primary" })}>
            Back to overview
          </Link>
        </div>
      </div>
    </>
  );
}
