"use client";

import { QuietLink } from "@/components/ds";
import { focusOnMount } from "./viewport-state";

export function ViewMessage({
  title,
  detail,
  view,
}: {
  title: string;
  detail?: string;
  view: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-12 text-center">
      <title>{`${title} - ${view}`}</title>
      <h1
        ref={focusOnMount}
        tabIndex={-1}
        className="t-section text-ink outline-none"
      >
        {title}
      </h1>
      {detail ? <p className="text-ink-2">{detail}</p> : null}
      <QuietLink href="/audits" className="mt-2">
        Back to audits
      </QuietLink>
    </div>
  );
}
