import type { components } from "@/api/types";
import { Panel, PanelHeader, QuietLink, StatusShape } from "@/components/ds";
import { DETECTOR_VAL_MAP } from "@/lib/detector";
import { plural, weekComparison, weekRange } from "@/lib/overview";

type Week = components["schemas"]["WeekSummary"];

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
}) {
  return (
    <div className="border-b border-r border-line p-4 even:border-r-0 nth-last-[-n+2]:border-b-0">
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="m-0 mt-1 flex flex-col gap-0.5 text-xs text-ink-3">
        <span className="num text-xl/7 font-semibold text-ink">{value}</span>
        {note}
      </dd>
    </div>
  );
}

export function WeekPanel({ week }: { week: Week }) {
  const median = Math.round(week.median_criteria_decided * 10) / 10;
  return (
    <Panel aria-labelledby="week-h">
      <PanelHeader id="week-h" title="This week" right={weekRange()} />
      <dl className="m-0 grid grid-cols-2">
        <Stat
          label="Audits run"
          value={week.audits_this_week}
          note={weekComparison(week.audits_this_week, week.audits_last_week)}
        />
        <Stat
          label="Fixes verified"
          value={week.fixes_verified_this_week}
          note="gone in a later audit"
        />
        <Stat
          label="Review decisions"
          value={week.decisions_this_week}
          note={plural(week.decisions_this_week, "decision")}
        />
        <Stat
          label="Criteria decided"
          value={`${median} of 8`}
          note="median on each site's latest audit"
        />
      </dl>
    </Panel>
  );
}

export function MethodPanel() {
  const items = [
    {
      kind: "undecided" as const,
      text: (
        <>
          The tool checks <b className="font-semibold text-ink">8 of the 86</b>{" "}
          WCAG 2.2 success criteria. A result is not a conformance claim.
        </>
      ),
    },
    {
      kind: "review" as const,
      text: (
        <>
          Findings that depend on the element detector are marked{" "}
          <b className="font-semibold text-ink">Needs review</b>. The element
          detector scores <span className="num">{DETECTOR_VAL_MAP}</span> mAP
          (50:95) on the WebUI validation set.
        </>
      ),
    },
    {
      kind: "done" as const,
      text: "A fix is verified only when a new audit no longer finds the issue.",
    },
  ];
  return (
    <Panel aria-labelledby="lim-h">
      <PanelHeader
        id="lim-h"
        title="Method and limits"
        right={<QuietLink href="/help">Read the method</QuietLink>}
      />
      <ul className="m-0 list-none px-4 pb-3 pt-2">
        {items.map((item) => (
          <li
            key={item.kind}
            className="grid grid-cols-[16px_1fr] gap-2.5 border-b border-line py-2 text-dense text-ink-2 last:border-b-0"
          >
            <StatusShape kind={item.kind} className="mt-1 text-ink-3" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
