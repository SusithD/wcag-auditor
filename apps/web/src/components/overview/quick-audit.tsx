"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { startAudit } from "@/components/audit/audit-request";
import { Kbd, Panel } from "@/components/ds";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeUrl } from "@/lib/url";

export function QuickAudit() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting) return;
    setFailure(null);
    const result = normalizeUrl(url);
    if (!result.ok) {
      setError(result.error);
      input.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const runId = await startAudit(
        { url: result.url },
        { viewports: ["desktop", "mobile"], condition: "hybrid", budget: 15 },
        queryClient,
      );
      router.push(`/runs/${runId}`);
    } catch (err) {
      setFailure(
        err instanceof Error ? err.message : "The audit could not be started",
      );
      setSubmitting(false);
    }
  }

  return (
    <Panel as="div" className="p-6 max-[720px]:p-4">
      <form
        noValidate
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        aria-label="Audit a page"
        className="flex flex-col gap-2"
      >
        <Label htmlFor={`${ids}-url`}>Web address</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`${ids}-url`}
            ref={input}
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com"
            value={url}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${ids}-hint`}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            className="min-w-60 flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            aria-disabled={submitting}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            {submitting ? "Starting audit" : "Run audit"}
            <Kbd
              aria-hidden="true"
              className="border-white/30 bg-transparent text-on-accent"
            >
              ⌘↵
            </Kbd>
          </Button>
        </div>
        <p
          id={`${ids}-hint`}
          className={
            error ? "text-label text-critical" : "text-label text-ink-3"
          }
        >
          {error ??
            "Desktop and mobile, detector and rules. The page must be publicly reachable."}
        </p>
        {failure ? (
          <p role="alert" className="text-body text-critical">
            {failure}
          </p>
        ) : null}
        <p className="text-dense text-ink-2">
          Want other sizes, screenshots or a different method?{" "}
          <Link href="/audit/new" className="underline">
            More options
          </Link>
        </p>
      </form>
    </Panel>
  );
}

export function FirstRun() {
  const steps = [
    {
      title: "Capture",
      text: "We open the page in Chromium and capture it at the sizes you choose.",
    },
    {
      title: "Check",
      text: "Browser rules and an element detector check 8 WCAG 2.2 criteria.",
    },
    {
      title: "Review",
      text: "You read the findings, decide the uncertain ones and mark fixes.",
    },
  ];
  return (
    <div className="flex max-w-190 flex-col gap-8">
      <section aria-labelledby="first-h" className="flex flex-col gap-3">
        <h2 id="first-h" className="t-section text-ink">
          Run your first audit
        </h2>
        <QuickAudit />
      </section>
      <section aria-labelledby="how-h">
        <h2 id="how-h" className="t-section mb-3 text-ink">
          How it works
        </h2>
        <ol className="m-0 grid list-none grid-cols-3 gap-4 p-0 max-[720px]:grid-cols-1">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-lg border border-line bg-surface p-4"
            >
              <span className="num text-label text-ink-3">
                Step {index + 1}
              </span>
              <h3 className="t-section text-ink">{step.title}</h3>
              <p className="m-0 text-dense text-ink-2">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-dense text-ink-2">
        The tool checks 8 of the 86 WCAG 2.2 success criteria, and a result is
        not a conformance claim.{" "}
        <Link href="/help" className="underline">
          Read how results are decided
        </Link>
        .
      </p>
      <Link
        href="/audit/new"
        className={`${buttonVariants({ variant: "default" })} w-fit`}
      >
        Audit screenshots instead
      </Link>
    </div>
  );
}
