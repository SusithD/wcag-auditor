import {
  type RatioPair,
  RULER_TICKS,
  rulerLabel,
  ruler as rulerOf,
  rulerPosition,
} from "./logic";

export function ContrastRuler({ pair }: { pair: RatioPair }) {
  const r = rulerOf(pair);
  const tone = r.passes ? "var(--ink-2)" : "var(--serious)";
  return (
    <div role="img" aria-label={rulerLabel(pair)} className="pt-1 pb-0.5">
      <div className="relative h-1.5 rounded-[3px] bg-track">
        {r.passes ? null : (
          <span
            className="absolute top-0 bottom-0 min-w-[3px] rounded-[3px]"
            style={{
              left: `${r.gapLeft}%`,
              width: `${r.gapWidth}%`,
              background: tone,
            }}
          />
        )}
        <span
          className="absolute -top-[5px] h-4 w-0.5 -translate-x-px bg-ink"
          style={{ left: `${r.required}%` }}
        />
        <span
          className="absolute -top-1 size-3.5 -translate-x-1/2 rounded-full border-[3px] bg-surface"
          style={{ left: `${r.measured}%`, borderColor: tone }}
        />
      </div>
      <div className="relative mt-1.5 h-[18px]" aria-hidden="true">
        {RULER_TICKS.map((v) => (
          <span
            key={v}
            className="num absolute -translate-x-1/2 text-[0.6875rem] text-ink-3"
            style={{ left: `${rulerPosition(v)}%` }}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
