import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import {
  Level,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  ScCode,
  Status,
  Tag,
} from "@/components/ds";

const CRITERIA: {
  sc: string;
  name: string;
  level: "A" | "AA" | "AAA";
  measures: string;
  how: string;
  provenance: string;
}[] = [
  {
    sc: "1.4.3",
    name: "Contrast (Minimum)",
    level: "AA",
    measures: "Text against the background behind it.",
    how: "4.5:1 for normal text, 3:1 for large text. When size and weight cannot be read, the result is needs review.",
    provenance: "Rule and pixel",
  },
  {
    sc: "1.4.11",
    name: "Non-text Contrast",
    level: "AA",
    measures:
      "Borders, icons and states of controls against their surroundings.",
    how: "3:1. Graphics are marked needs review.",
    provenance: "Pixel",
  },
  {
    sc: "2.4.7",
    name: "Focus Visible",
    level: "AA",
    measures: "Whether keyboard focus changes what is drawn.",
    how: "Compares a focused and an unfocused screenshot of each stop. WCAG gives no number, so the tool counts focus as visible if the change is at least 1.5:1, the threshold fixed by Protocol v1.1.",
    provenance: "Pixel",
  },
  {
    sc: "2.4.11",
    name: "Focus Not Obscured (Minimum)",
    level: "AA",
    measures:
      "Whether the focused element is entirely covered by other content.",
    how: "Fails when the whole element is hidden by author content. Open dialogs are exempt.",
    provenance: "Pixel, with page HTML when present",
  },
  {
    sc: "2.4.12",
    name: "Focus Not Obscured (Enhanced)",
    level: "AAA",
    measures: "Whether any part of the focused element is covered.",
    how: "Fails when part or all of it is hidden. This is the stricter AAA version of 2.4.11.",
    provenance: "Pixel, with page HTML when present",
  },
  {
    sc: "2.4.13",
    name: "Focus Appearance",
    level: "AAA",
    measures: "Size and contrast of the focus indicator.",
    how: "A complete ring of at least 2 px with 3:1 change meets it; otherwise the area of changed pixels is measured.",
    provenance: "Pixel",
  },
  {
    sc: "2.5.7",
    name: "Dragging Movements",
    level: "AA",
    measures:
      "Custom sliders and drag widgets that have no single-pointer alternative.",
    how: "Needs the page HTML. Native range inputs are not flagged. Without HTML the criterion shows as Could not decide.",
    provenance: "Page HTML",
  },
  {
    sc: "2.5.8",
    name: "Target Size (Minimum)",
    level: "AA",
    measures: "Size of clickable targets.",
    how: "Targets under 24 by 24 CSS px fail unless an exception applies (inline text, enough spacing, equivalent control). Sizes taken from a detector box are needs review.",
    provenance: "Rule and pixel",
  },
];

const TIERS: { tag: ReactNode; text: string }[] = [
  {
    tag: <Tag>Automated</Tag>,
    text: "The tool measured it and reports a result. A person can still disagree, and the review queue records that.",
  },
  {
    tag: <Tag tone="review">Needs review</Tag>,
    text: "The tool found something it cannot settle alone. Each one states the reason, for example that text size is unknown.",
  },
  {
    tag: <Tag>Not assessable</Tag>,
    text: "The input needed was missing, so the criterion shows as Could not decide. It is never counted as No issue found.",
  },
];

const PROVENANCE: { tag: string; text: string }[] = [
  {
    tag: "Rule",
    text: "Found by a deterministic rule engine reading the page, such as the axe contrast check.",
  },
  {
    tag: "Pixel",
    text: "Measured from the screenshot by this tool's own image analysis, with element boxes from a detector when the page HTML is not available.",
  },
  {
    tag: "Rule and pixel",
    text: "Both channels reported the same place.",
  },
];

const BOXES: { tag: string; text: string }[] = [
  {
    tag: "Measured",
    text: "Drawn as a solid box. The tool measured this position.",
  },
  {
    tag: "Estimated by the detector",
    text: "Drawn as a dashed box. The element detector estimated the position from the screenshot.",
  },
];

const METHODS: { tag: string; text: string }[] = [
  {
    tag: "Detector and rules",
    text: "Decides all 8 criteria with the page HTML and 5 of 8 from a screenshot alone.",
  },
  {
    tag: "Rules only",
    text: "Decides 2 of 8 criteria.",
  },
];

const COVERAGE: {
  shape: "pass" | "failed" | "review" | "undecided";
  word: string;
  text: string;
}[] = [
  {
    shape: "failed",
    word: "Failed",
    text: "A measured failure of the criterion.",
  },
  {
    shape: "review",
    word: "Needs review",
    text: "Something was found that a person must settle.",
  },
  {
    shape: "pass",
    word: "No issue found",
    text: "The checks ran and found nothing. This is not a statement that the criterion is met.",
  },
  {
    shape: "undecided",
    word: "Could not decide",
    text: "The tool had no reliable way to decide with the input it was given.",
  },
  {
    shape: "undecided",
    word: "No verdict",
    text: "The method returned nothing for the criterion.",
  },
];

const LIMITS = [
  "This tool checks 8 of the 86 WCAG 2.2 success criteria. The other 78 are not checked at all.",
  "No issue found is not the same as conformance. A page with no issue found on all eight can still fail other criteria.",
  "Severity describes impact, not conformance. A minor finding is still a failure of the criterion.",
  "Screenshots show one state of the page. Content behind logins, hover menus and other states is not seen.",
  "Focus checks cover only the recorded focus steps.",
  "Detector boxes are estimates. Where a result depends on one, it is marked needs review.",
  "A fix you mark as fixed shows as Fix not verified until a later audit no longer finds the problem.",
  "Automated checks do not replace testing with people who use assistive technology.",
];

const SECTIONS = [
  { id: "criteria", label: "The 8 criteria" },
  { id: "tiers", label: "Tiers" },
  { id: "provenance", label: "Provenance" },
  { id: "boxes", label: "Box legend" },
  { id: "methods", label: "Methods" },
  { id: "coverage", label: "Coverage states" },
  { id: "limits", label: "What this result does not mean" },
  { id: "protocol", label: "Protocol" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20">
      <PanelHeader id={`${id}-h`} title={title} />
      {children}
    </Panel>
  );
}

function Rows({
  items,
}: {
  items: { key: string; head: ReactNode; text: string }[];
}) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((item) => (
        <li
          key={item.key}
          className="grid gap-1 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
        >
          <div className="font-medium text-ink">{item.head}</div>
          <p className="m-0 text-ink-2">{item.text}</p>
        </li>
      ))}
    </ul>
  );
}

export function HelpScreen() {
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Help and method"
        description="The criteria this tool checks, how it decides, and what its results do not mean."
      />
      <nav aria-label="On this page" className="mb-6">
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-dense">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-6 items-center text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid gap-4">
        <Section id="criteria" title="The 8 criteria">
          <PanelBody className="pb-0 text-ink-2">
            <p className="m-0">
              Each result names its criterion and its WCAG level. Six of the
              eight criteria are level AA and two are level AAA (2.4.12 and
              2.4.13).
            </p>
          </PanelBody>
          <ul className="m-0 list-none p-0">
            {CRITERIA.map((c) => (
              <li
                key={c.sc}
                className="grid gap-1 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ScCode code={c.sc} />
                  <span className="font-medium text-ink">{c.name}</span>
                  <Level level={c.level} />
                </div>
                <p className="m-0 text-ink-2">{c.measures}</p>
                <p className="m-0 text-dense text-ink-3">{c.how}</p>
                <p className="m-0 text-dense text-ink-3">
                  Source of evidence: {c.provenance}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="tiers" title="Tiers">
          <Rows
            items={TIERS.map((t, i) => ({
              key: String(i),
              head: t.tag,
              text: t.text,
            }))}
          />
        </Section>

        <Section id="provenance" title="Provenance">
          <Rows
            items={PROVENANCE.map((p) => ({
              key: p.tag,
              head: <Tag>{p.tag}</Tag>,
              text: p.text,
            }))}
          />
        </Section>

        <Section id="boxes" title="Box legend">
          <Rows
            items={BOXES.map((b) => ({
              key: b.tag,
              head: <Tag>{b.tag}</Tag>,
              text: b.text,
            }))}
          />
        </Section>

        <Section id="methods" title="Methods">
          <Rows
            items={METHODS.map((m) => ({
              key: m.tag,
              head: <Tag>{m.tag}</Tag>,
              text: m.text,
            }))}
          />
        </Section>

        <Section id="coverage" title="Coverage states">
          <Rows
            items={COVERAGE.map((c) => ({
              key: c.word,
              head: (
                <Status kind={c.shape} strong>
                  {c.word}
                </Status>
              ),
              text: c.text,
            }))}
          />
        </Section>

        <Section id="limits" title="What this result does not mean">
          <PanelBody>
            <ul className="m-0 grid list-disc gap-2 pl-5 text-ink-2">
              {LIMITS.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </PanelBody>
        </Section>

        <Section id="protocol" title="Protocol">
          <PanelBody className="grid gap-3 text-ink-2">
            <p className="m-0">
              Thresholds and rulings follow Protocol v1.1, which is fixed for
              this study. The tool does not add criteria or change thresholds
              between audits.
            </p>
            <p className="m-0 flex flex-wrap gap-x-6 gap-y-2">
              <a
                href="/api/catalogue"
                className="inline-flex min-h-6 items-center gap-1 text-ink underline underline-offset-4"
              >
                Check catalogue (data)
              </a>
              <a
                href="https://www.w3.org/TR/WCAG22/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-6 items-center gap-1 text-ink underline underline-offset-4"
              >
                WCAG 2.2 specification
                <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </p>
          </PanelBody>
        </Section>
      </div>
    </div>
  );
}
