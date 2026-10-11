"use client";

import { ExternalLink, Monitor, Smartphone } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";
import {
  DefinitionRows,
  Kbd,
  Level,
  ScCode,
  Status,
  Tag,
} from "@/components/ds";
import { OptionCard, OptionGroup } from "@/components/settings/option-card";
import { splitSite } from "@/components/sites/site-label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type Choice,
  choiceWord,
  DISMISS_REASONS,
  decisionOf,
  formatDecided,
  type ReviewItem,
  reasonSentence,
} from "./review-model";

const PROVENANCE = { rule: "Rule", pixel: "Pixel", both: "Rule and pixel" };

export function ReviewDetail({
  item,
  choice,
  onChoice,
  reason,
  onReason,
  note,
  onNote,
  error,
  onSave,
  saving,
  shortcuts,
  headingRef,
  radioRefs,
  reasonRef,
}: {
  item: ReviewItem;
  choice: Choice | null;
  onChoice: (choice: Choice) => void;
  reason: string;
  onReason: (reason: string) => void;
  note: string;
  onNote: (note: string) => void;
  error: string | null;
  onSave: () => void;
  saving: boolean;
  shortcuts: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  radioRefs: RefObject<Record<Choice, HTMLInputElement | null>>;
  reasonRef: RefObject<HTMLDivElement | null>;
}) {
  const f = item.finding;
  const ViewportIcon = item.viewport === "mobile" ? Smartphone : Monitor;
  const { host, path } = splitSite(item.site);
  const reportHref = `/runs/${item.run_id}?vp=${item.viewport}&f=${encodeURIComponent(f.key)}`;
  const decision = decisionOf(f);
  const evidence = [
    ...f.evidence_rows.map((row) => ({
      label: row.label,
      value: <span className="num">{row.value}</span>,
    })),
    {
      label: "Element",
      value: <span className="font-mono text-xs break-all">{f.element}</span>,
    },
    {
      label: "Found by",
      value: <Tag>{PROVENANCE[f.provenance]}</Tag>,
    },
    {
      label: "Severity if confirmed",
      value: (
        <Status kind={f.severity} strong>
          {f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}
        </Status>
      ),
    },
    {
      label: "Source",
      value: (
        <Link
          href={reportHref}
          className="inline-flex min-h-6 items-center gap-1 text-ink underline underline-offset-4"
        >
          Open in report
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
      ),
    },
  ];

  const options: {
    value: Choice;
    title: string;
    description: string;
    key: string;
  }[] = [
    {
      value: "confirmed",
      title: "Confirm issue",
      description: "The finding is a real failure of the criterion.",
      key: "C",
    },
    {
      value: "dismissed",
      title: "Dismiss",
      description: "The tool was wrong or the criterion does not apply.",
      key: "X",
    },
    {
      value: "unsure",
      title: "Could not decide, keep in queue",
      description: "Leave it waiting for someone else to check.",
      key: "U",
    },
  ];

  return (
    <section
      aria-label="Finding detail"
      className="flex min-h-0 min-w-0 flex-col"
    >
      <div
        className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-8"
        role="region"
        aria-label="Finding detail, scrollable"
        tabIndex={0}
      >
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-dense text-ink-3">
            <b className="font-medium text-ink">{host}</b>
            {path ? <span className="font-mono">{path}</span> : null}
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <ViewportIcon className="size-3.5" aria-hidden="true" />
              {item.viewport === "mobile" ? "Mobile" : "Desktop"}
            </span>
          </div>
          <div className="mt-2 mb-3 flex flex-wrap items-center gap-3">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="m-0 text-xl/7 font-semibold tracking-tight text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ScCode code={f.sc} className="mr-1 text-[length:inherit]" />
              {f.guidance?.sc_title ?? "Success criterion"}
            </h2>
            {f.guidance ? (
              <Level level={f.guidance.level as "A" | "AA" | "AAA"} />
            ) : null}
          </div>
          <div className="mb-4 flex flex-wrap items-start gap-3">
            <Tag tone="review">Needs review</Tag>
            <p className="m-0 min-w-0 flex-1 basis-64 text-ink">
              {reasonSentence(f.needs_review_reason)}
            </p>
          </div>

          {f.has_crop ? (
            <figure className="m-0">
              {/* biome-ignore lint/performance/noImgElement: crop is a served file from the audit service */}
              <img
                src={`/api/runs/${item.run_id}/assets/${item.viewport}/crop/${f.key}`}
                alt={`Crop of the element: ${f.element}`}
                className="max-h-48 max-w-full rounded-md border border-line bg-surface"
              />
              <figcaption className="mt-1.5 text-xs text-ink-3">
                Element crop
              </figcaption>
            </figure>
          ) : (
            <p className="m-0 text-dense text-ink-3">
              No crop of this element was saved. Open it in the report to see it
              on the page.
            </p>
          )}

          <section className="mt-5" aria-labelledby="rv-evidence">
            <h3
              id="rv-evidence"
              className="mb-2 text-dense font-semibold text-ink"
            >
              Evidence
            </h3>
            <DefinitionRows rows={evidence} className="border-t border-line" />
          </section>

          {f.guidance?.what_failed ? (
            <div className="mt-5 flex gap-3 rounded-md border border-line bg-subtle p-3">
              <p className="m-0">
                <b className="font-semibold">What the tool found.</b>{" "}
                {f.guidance.what_failed}
              </p>
            </div>
          ) : null}

          {decision.decided_at ? (
            <p className="mt-5 mb-0 text-dense text-ink-3">
              {choiceWord(f.status)}
              {decision.reason ? ` (${decision.reason})` : ""} by{" "}
              {decision.decided_by ?? "unknown"},{" "}
              {formatDecided(decision.decided_at)}
              {decision.note ? `. Note: ${decision.note}` : ""}
            </p>
          ) : null}

          <OptionGroup radio legend="Your decision" className="mt-5">
            {options.map((option) => (
              <OptionCard
                key={option.value}
                name="decision"
                value={option.value}
                checked={choice === option.value}
                onChange={() => onChoice(option.value)}
                title={option.title}
                description={option.description}
                hint={shortcuts ? <Kbd>{option.key}</Kbd> : null}
                inputRef={(el) => {
                  if (radioRefs.current) radioRefs.current[option.value] = el;
                }}
              >
                {option.value === "dismissed" && choice === "dismissed" ? (
                  <div
                    ref={reasonRef}
                    role="group"
                    aria-label="Choose a reason for dismissing"
                    aria-describedby={
                      error && !reason ? "review-error" : undefined
                    }
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <span className="w-full text-xs font-medium text-ink-3">
                      Choose a reason for dismissing
                    </span>
                    {DISMISS_REASONS.map((label) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={reason === label}
                        onClick={() => onReason(reason === label ? "" : label)}
                        className={cn(
                          "inline-flex min-h-7 items-center rounded-full border border-line-control bg-surface px-3 text-dense font-medium text-ink-2 hover:bg-subtle",
                          "aria-pressed:border-accent aria-pressed:bg-tint aria-pressed:text-ink aria-pressed:shadow-[0_0_0_1px_var(--accent)]",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </OptionCard>
            ))}
          </OptionGroup>

          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="review-note" className="text-dense font-medium">
              Note <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <textarea
              id="review-note"
              value={note}
              onChange={(event) => onNote(event.target.value)}
              placeholder="Computed font size was 19.2 px at weight 400"
              className="min-h-18 w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-3"
            />
          </div>
          {error ? (
            <p
              id="review-error"
              role="alert"
              className="mt-3 mb-0 flex items-center gap-2 text-dense font-medium text-critical"
            >
              <Status kind="critical">
                <span className="text-ink">{error}</span>
              </Status>
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface px-4 py-3 sm:px-8">
        <div className="mr-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-dense text-ink-3">
          {shortcuts ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> move
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>C</Kbd>
                <Kbd>X</Kbd>
                <Kbd>U</Kbd> decide
              </span>
            </>
          ) : (
            <span>
              Single-key shortcuts are off.{" "}
              <Link href="/settings" className="underline underline-offset-4">
                Turn them on in Settings
              </Link>
            </span>
          )}
        </div>
        <Button
          variant="primary"
          onClick={onSave}
          disabled={saving}
          aria-describedby={error ? "review-error" : undefined}
        >
          Save and next
        </Button>
      </div>
    </section>
  );
}
