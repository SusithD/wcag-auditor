"use client";

import { EmptyState } from "@/components/ds";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <>
      <PageTitle title="Something went wrong - WCAG Auditor" />
      <EmptyState
        as="h1"
        className="py-16"
        title="Something went wrong"
        action={
          <Button variant="primary" onClick={() => reset()}>
            Try again
          </Button>
        }
      >
        This page could not be shown. Try again, and if it keeps happening,
        restart the app.
      </EmptyState>
    </>
  );
}
