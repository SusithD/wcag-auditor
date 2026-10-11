"use client";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DefinitionRows,
  Level,
  Ratio,
  ScCode,
  StatusShape,
  Tag,
} from "@/components/ds";
import type { TagTone } from "@/components/ds/tag";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type Finding,
  plainText,
  plainValue,
  SEV_LABEL,
  sevKey,
  TIER_LABEL,
} from "@/lib/report";
import { cn } from "@/lib/utils";
import { ContrastRuler } from "./contrast-ruler";
import {
  DISMISS_REASONS,
  type FixDiff,
  fixDiff,
  foundBy,
  parseRatio,
  provenanceWords,
  ratioPair,
  ruler,
  SC_LEVELS,
  scTitle,
  sentence,
} from "./logic";
import { Seg } from "./seg";
import type { DecisionVars } from "./use-report-queries";

type Props = {
  runId: string;
  finding: Finding | null;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onDecide: (vars: Omit<DecisionVars, "id">) => void;
  saveError: boolean;
  empty: boolean;
  readOnly?: boolean;
  shortcuts?: boolean;
  onBack?: () => void;
  onAnnounce?: (message: string) => void;
};

function CopyButton({
  text,
  format,
  onCopied,
}: {
  text: string;
  format: string;
  onCopied?: (message: string) => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          onCopied?.(`${format} copied`);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {done ? "Copied" : `Copy ${format}`}
    </Button>
  );
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3.5 flex-none rounded-[3px] shadow-[inset_0_0_0_1px_var(--line-strong)]"
      style={{ background: hex }}
    />
  );
}

function DiffView({ diff, label }: { diff: FixDiff; label: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-line text-dense">
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="overflow-x-auto"
      >
        <div className="min-w-max">
          {diff.lines.map((line, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: ordered code lines
              key={i}
              className={cn(
                "grid grid-cols-[24px_1fr_auto] items-center gap-2 py-1.5 pr-2.5",
                line.sign === "-" ? "bg-critical-bg" : "bg-pass-bg",
              )}
            >
              <span
                aria-hidden="true"
                className="text-center font-mono text-ink-3"
              >
                {line.sign === "-" ? "−" : "+"}
              </span>
              <span className="font-mono whitespace-pre">
                <span className="sr-only">
                  {line.sign === "-" ? "Remove: " : "Add: "}
                </span>
                {line.text}
              </span>
              {line.swatch ? <Swatch hex={line.swatch} /> : <span />}
            </div>
          ))}
        </div>
      </div>
      {diff.change ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-2.5 py-2">
          <Ratio value={diff.change.before} />
          <span aria-hidden="true" className="text-ink-3">
            →
          </span>
          <span className="sr-only">changes to</span>
          <Ratio value={diff.change.after} />
          <span className="text-ink-3">
            on {diff.change.against.toUpperCase()}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function FixSection({
  finding,
  onAnnounce,
}: {
  finding: Finding;
  onAnnounce?: (message: string) => void;
}) {
  const g = finding.guidance;
  const [format, setFormat] = useState<"css" | "html">(
    g?.fix_css || !g?.fix_html ? "css" : "html",
  );
  if (!g) return null;
  const code = format === "css" ? g.fix_css : g.fix_html;
  const upper = format === "css" ? "CSS" : "HTML";
  const diff = fixDiff(format, code, finding.evidence_rows);
  return (
    <section
      aria-labelledby="fix-h"
      className="flex flex-col gap-2.5 border-b border-line px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="fix-h" className="text-xs font-semibold text-ink-2">
          Suggested fix
        </h3>
        {g.fix_css && g.fix_html ? (
          <Seg<"css" | "html">
            small
            label="Fix format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "css", label: "CSS" },
              { value: "html", label: "HTML" },
            ]}
          />
        ) : null}
      </div>
      <p className="text-dense text-ink-2">{plainText(g.nearest_passing)}</p>
      {code ? (
        <>
          <DiffView diff={diff} label={`${upper} fix`} />
          <div className="flex flex-wrap items-center gap-3">
            <CopyButton text={code} format={upper} onCopied={onAnnounce} />
            <a
              href={g.understanding}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[24px] items-center gap-1 text-dense font-medium text-accent underline underline-offset-2"
            >
              Understanding {finding.sc}
              <ExternalLink className="size-3" aria-hidden="true" />
              <span className="sr-only"> (W3C, opens in a new tab)</span>
            </a>
          </div>
        </>
      ) : null}
      {g.techniques.length ? (
        <ul className="space-y-0.5 text-xs">
          {g.techniques.map((t) => (
            <li key={t.id}>
              <a
                className="inline-flex min-h-[24px] items-center text-ink-2 underline underline-offset-2"
                href={t.url}
              >
                {t.id}: {t.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function DecisionNotice({ finding }: { finding: Finding }) {
  const d = finding.decision;
  const by = [
    d?.decided_by,
    d?.decided_at
      ? new Date(d.decided_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  let title: string | null = null;
  let body: string | null = null;
  if (finding.status === "fixed") {
    title = "Fix not verified";
    body =
      "You marked this as fixed. It counts as verified when a later audit no longer finds it.";
  } else if (finding.status === "dismissed") {
    title = "Dismissed";
    body = d?.reason ? `Reason: ${d.reason}.` : null;
  } else if (finding.status === "confirmed") {
    title = "Confirmed as an issue";
    body = "Decided in the review queue.";
  } else if (finding.status === "unsure") {
    title = "Marked as could not decide";
    body = "Decided in the review queue. It is still waiting for a decision.";
  }
  if (!title) return null;
  return (
    <div
      data-testid="decision-notice"
      className="mx-4 mt-3.5 mb-1 rounded-md border border-line bg-subtle p-3 text-dense"
    >
      <p className="flex items-center gap-2 font-medium text-ink">
        {finding.status === "fixed" ? <StatusShape kind="undecided" /> : null}
        {title}
      </p>
      {body ? <p className="mt-1 text-ink-2">{body}</p> : null}
      {d?.note ? <p className="mt-1 text-ink-2">Note: {d.note}</p> : null}
      {by ? <p className="mt-1 text-xs text-ink-3">{by}</p> : null}
    </div>
  );
}

export function DetailPane({
  runId,
  finding,
  index,
  total,
  onPrev,
  onNext,
  onDecide,
  saveError,
  empty,
  readOnly = false,
  shortcuts = true,
  onBack,
  onAnnounce,
}: Props) {
  const afterDecision = useRef<"reopen" | "actions" | null>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const markFixed = useRef<HTMLButtonElement>(null);
  const status = finding?.status;
  // biome-ignore lint/correctness/useExhaustiveDependencies: move focus only after the user's own decision changes the status
  useEffect(() => {
    const target = afterDecision.current;
    afterDecision.current = null;
    if (target === "reopen") reopen.current?.focus();
    else if (target === "actions") markFixed.current?.focus();
  }, [status]);

  if (!finding) {
    return (
      <div className="p-4 text-body text-ink-2">
        <h2
          id="detail-h"
          tabIndex={-1}
          className="t-section text-ink outline-none"
        >
          Finding details
        </h2>
        <p className="mt-2">
          {empty
            ? "Nothing matches the current filters."
            : "Select a finding on the canvas, in the table or with J and K to see its evidence and how to fix it."}
        </p>
      </div>
    );
  }

  const key = sevKey(finding);
  const tone: TagTone = key === "needs-review" ? "review" : key;
  const pair = ratioPair(finding.evidence_rows);
  const shortBy = pair ? ruler(pair).shortBy : 0;
  const reason = sentence(finding.needs_review_reason);
  const g = finding.guidance;
  const cropAlt = `${finding.focus_index != null ? "Before and after keyboard focus" : "Element"} for ${finding.sc}, ${finding.element}`;
  const rows = [
    ...finding.evidence_rows
      .filter(
        (r) =>
          !pair ||
          ![
            "Measured contrast",
            "Required contrast",
            "Strongest state change",
            "Required change",
          ].includes(r.label),
      )
      .map((r) => ({
        label: r.label,
        value: swatchOrText(r.value),
      })),
    {
      label: "Element",
      value: (
        <span className="font-mono [overflow-wrap:anywhere]">
          {finding.element}
        </span>
      ),
    },
    { label: "Found by", value: foundBy(finding) },
  ];
  const decide = (
    vars: Omit<DecisionVars, "id">,
    then: "reopen" | "actions",
  ) => {
    afterDecision.current = then;
    onDecide(vars);
  };
  const open = ["open", "unsure", "confirmed"].includes(finding.status);

  return (
    <article
      aria-labelledby="detail-h"
      className="flex h-full min-h-0 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2.5 border-b border-line p-4">
          {onBack ? (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={onBack}
            >
              <ChevronLeft aria-hidden="true" />
              Back to findings
            </Button>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Tag tone={tone}>{SEV_LABEL[key]}</Tag>
            <span className="text-dense text-ink-3">
              {provenanceWords(finding)}
            </span>
            <span className="sr-only">{TIER_LABEL[finding.tier]}</span>
          </div>
          <h2
            id="detail-h"
            tabIndex={-1}
            className="t-section flex flex-wrap items-center gap-2 text-ink outline-none"
          >
            <ScCode code={finding.sc} />
            <span>{scTitle(finding.sc)}</span>
            <Level level={SC_LEVELS[finding.sc] ?? "AA"} />
          </h2>
          {pair ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2.5 text-dense">
                <Ratio
                  value={pair.measured}
                  className="text-[1.75rem] leading-8 tracking-[-0.01em]"
                />
                <span className="text-ink-3">
                  needs{" "}
                  <Ratio
                    value={pair.required}
                    digits={Number.isInteger(pair.required) ? 0 : 1}
                    className="text-ink-3"
                  />{" "}
                  ·{" "}
                  {shortBy > 0 ? (
                    <>
                      short by <span className="num">{shortBy.toFixed(2)}</span>
                    </>
                  ) : (
                    "meets it"
                  )}
                </span>
              </div>
              <ContrastRuler pair={pair} />
            </>
          ) : null}
          {g ? (
            <p className="text-dense text-ink-2">{plainText(g.what_failed)}</p>
          ) : null}
          {reason ? (
            <div className="flex items-start gap-2.5 rounded-md bg-review-bg p-2.5 text-dense text-ink">
              <StatusShape kind="review" className="mt-1" />
              <p>
                <span className="font-medium">Why it needs review. </span>
                {reason}
              </p>
            </div>
          ) : null}
        </div>

        <DecisionNotice finding={finding} />

        <section
          aria-labelledby="evidence-h"
          className="flex flex-col gap-2 border-b border-line px-4 py-3.5"
        >
          <h3 id="evidence-h" className="text-xs font-semibold text-ink-2">
            Evidence
          </h3>
          <DefinitionRows rows={rows} className="-mt-1" />
          {finding.has_crop ? (
            // biome-ignore lint/performance/noImgElement: element crop served by the API
            <img
              src={`/api/runs/${runId}/assets/${finding.viewport}/crop/${finding.key}`}
              alt={cropAlt}
              className="mt-1 aspect-[16/7] w-full rounded-md border border-line bg-subtle object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ) : null}
        </section>

        <FixSection
          key={finding.key}
          finding={finding}
          onAnnounce={onAnnounce}
        />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-line px-3 py-2.5">
        <div className="flex items-center gap-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onPrev}
            aria-label="Previous finding"
            aria-keyshortcuts={shortcuts ? "K" : undefined}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="num min-w-14 text-center text-dense text-ink-2">
            {index + 1} of {total}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onNext}
            aria-label="Next finding"
            aria-keyshortcuts={shortcuts ? "J" : undefined}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {readOnly ? null : open ? (
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" />}>
                Dismiss
                <ChevronDown aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Reason for dismissing</DropdownMenuLabel>
                  {DISMISS_REASONS.map((r) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() =>
                        decide({ status: "dismissed", reason: r }, "reopen")
                      }
                    >
                      {r}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              ref={markFixed}
              size="sm"
              variant="primary"
              onClick={() => decide({ status: "fixed" }, "reopen")}
            >
              <Check aria-hidden="true" />
              Mark as fixed
            </Button>
          </div>
        ) : (
          <Button
            ref={reopen}
            size="sm"
            variant="outline"
            onClick={() => decide({ status: "open" }, "actions")}
          >
            Reopen
          </Button>
        )}
        {saveError ? (
          <p role="alert" className="w-full text-xs text-critical">
            The decision could not be saved. The finding is back to how it was.
          </p>
        ) : null}
      </footer>
    </article>
  );
}

function swatchOrText(value: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
  if (hex) {
    return (
      <span className="inline-flex items-center gap-2">
        <Swatch hex={hex} />
        <span className="font-mono">{hex.toUpperCase()}</span>
      </span>
    );
  }
  const ratio = parseRatio(value);
  return ratio !== null ? <Ratio value={ratio} /> : plainValue(value);
}
