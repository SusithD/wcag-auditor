"use client";

import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type Finding,
  PROV_GLYPH,
  PROV_LABEL,
  SC_TITLES,
  SEV_GLYPH,
  SEV_LABEL,
  scoreSegments,
  sevKey,
  swatches,
  TIER_LABEL,
} from "@/lib/report";

type Props = {
  runId: string;
  finding: Finding | null;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onStatus: (status: "open" | "fixed" | "ignored") => void;
  saving: boolean;
  saveError: boolean;
  empty: boolean;
  readOnly?: boolean;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

export function DetailPane({
  runId,
  finding,
  index,
  total,
  onPrev,
  onNext,
  onStatus,
  saving,
  saveError,
  empty,
  readOnly = false,
}: Props) {
  if (!finding) {
    return (
      <div className="p-4 text-body text-muted-foreground">
        <h2 className="text-h3 font-semibold text-foreground">
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
  const g = finding.guidance;
  const chips = swatches(finding.evidence_rows);
  const segments = scoreSegments(finding.score);
  const cropAlt = `${finding.focus_index != null ? "Before and after keyboard focus" : "Element"} for ${finding.sc}, ${finding.element}`;

  return (
    <article aria-labelledby="detail-h" className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <header>
          <h2
            id="detail-h"
            className="flex flex-wrap items-center gap-2 text-h3 font-semibold"
          >
            <span
              className={`inline-flex items-center gap-1 text-body text-sev-${key === "needs-review" ? "review" : key}`}
            >
              <span aria-hidden="true">{SEV_GLYPH[key]}</span>
              {SEV_LABEL[key]}
            </span>
            <span>
              {finding.sc} {SC_TITLES[finding.sc]}
            </span>
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            {g ? (
              <a
                href={g.understanding}
                className="inline-flex min-h-6 items-center rounded-full border px-2 font-mono text-label underline underline-offset-4"
              >
                {finding.sc} on w3.org
                <span className="sr-only"> (Understanding document)</span>
              </a>
            ) : null}
            <Badge variant="outline">
              <span aria-hidden="true">{PROV_GLYPH[finding.provenance]}</span>{" "}
              {PROV_LABEL[finding.provenance]}
            </Badge>
            <Badge variant="outline">{TIER_LABEL[finding.tier]}</Badge>
            <span className="inline-flex items-center gap-1.5 text-caption">
              <span className="font-mono">
                Score {finding.score.toFixed(2)}
              </span>
              <span aria-hidden="true" className="flex gap-0.5">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-3 rounded-sm ${i < segments ? "bg-foreground" : "bg-border"}`}
                  />
                ))}
              </span>
            </span>
          </p>
          <p className="mt-2 break-words font-mono text-label text-muted-foreground">
            {finding.element}
          </p>
        </header>

        {g ? <p className="text-body">{g.what_failed}</p> : null}

        <section
          aria-labelledby="evidence-h"
          className="rounded-lg border bg-card p-3"
        >
          <h3 id="evidence-h" className="text-row font-semibold">
            Evidence
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            {finding.evidence_rows.map((r) => (
              <div key={`${r.label}-${r.value}`}>
                <dt className="text-caption text-muted-foreground">
                  {r.label}
                </dt>
                <dd className="font-mono text-body">{r.value}</dd>
              </div>
            ))}
          </dl>
          {chips.length ? (
            <ul
              className="mt-3 flex flex-wrap gap-3"
              aria-label="Sampled colours"
            >
              {chips.map((c) => (
                <li
                  key={`${c.label}-${c.hex}`}
                  className="flex items-center gap-2 text-caption"
                >
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-sm border"
                    style={{ background: c.hex }}
                  />
                  <span>
                    {c.label} <span className="font-mono">{c.hex}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {finding.has_crop ? (
            // biome-ignore lint/performance/noImgElement: element crop served by the API
            <img
              src={`/api/runs/${runId}/assets/${finding.viewport}/crop/${finding.key}`}
              alt={cropAlt}
              className="mt-3 h-auto max-w-full rounded-md border"
              style={{ imageRendering: "pixelated" }}
            />
          ) : null}
        </section>

        {g ? (
          <section aria-labelledby="fix-h">
            <h3 id="fix-h" className="text-row font-semibold">
              How to fix
            </h3>
            <p className="mt-1 text-body">{g.nearest_passing}</p>
            <Tabs defaultValue={g.fix_html ? "html" : "css"} className="mt-2">
              <TabsList>
                {g.fix_html ? (
                  <TabsTrigger value="html">HTML</TabsTrigger>
                ) : null}
                <TabsTrigger value="css">CSS</TabsTrigger>
              </TabsList>
              <TabsContent value="css">
                <div className="flex items-start gap-2">
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label="CSS fix"
                    className="min-w-0 flex-1 overflow-auto rounded-md border bg-muted p-2 font-mono text-label"
                  >
                    <code>{g.fix_css}</code>
                  </pre>
                  <CopyButton text={g.fix_css} label="Copy CSS" />
                </div>
              </TabsContent>
              {g.fix_html ? (
                <TabsContent value="html">
                  <div className="flex items-start gap-2">
                    <pre
                      tabIndex={0}
                      role="region"
                      aria-label="HTML fix"
                      className="min-w-0 flex-1 overflow-auto rounded-md border bg-muted p-2 font-mono text-label"
                    >
                      <code>{g.fix_html}</code>
                    </pre>
                    <CopyButton text={g.fix_html} label="Copy HTML" />
                  </div>
                </TabsContent>
              ) : null}
            </Tabs>
            <ul className="mt-2 space-y-1 text-caption">
              {g.techniques.map((t) => (
                <li key={t.id}>
                  <a
                    className="flex min-h-7 w-fit items-center underline underline-offset-4"
                    href={t.url}
                  >
                    {t.id}: {t.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
        {readOnly ? null : (
          <div className="flex gap-1" role="group" aria-label="Finding status">
            <Button
              size="sm"
              variant={finding.status === "fixed" ? "secondary" : "outline"}
              aria-pressed={finding.status === "fixed"}
              disabled={saving}
              onClick={() =>
                onStatus(finding.status === "fixed" ? "open" : "fixed")
              }
            >
              {finding.status === "fixed" ? "Fixed" : "Mark fixed"}
            </Button>
            <Button
              size="sm"
              variant={finding.status === "ignored" ? "secondary" : "outline"}
              aria-pressed={finding.status === "ignored"}
              disabled={saving}
              onClick={() =>
                onStatus(finding.status === "ignored" ? "open" : "ignored")
              }
            >
              {finding.status === "ignored" ? "Ignored" : "Ignore"}
            </Button>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onPrev}
            aria-label="Previous finding"
          >
            <ChevronLeft aria-hidden="true" />
            <Kbd aria-hidden="true">K</Kbd>
          </Button>
          <span className="font-mono text-label" aria-live="polite">
            {index + 1} of {total}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onNext}
            aria-label="Next finding"
          >
            <Kbd aria-hidden="true">J</Kbd>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {saveError ? (
          <p role="alert" className="w-full text-caption text-destructive">
            The status could not be saved.
          </p>
        ) : null}
      </footer>
    </article>
  );
}
