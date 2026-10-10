"use client";

import { Maximize, Minus, Plus, ScanLine } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { prefersReducedMotion } from "@/hooks/use-media-query";
import {
  ariaLabel,
  cycle,
  type Finding,
  fitTransform,
  fitWidth,
  readingOrder,
  SC_TITLES,
  SEV_DASH,
  SEV_GLYPH,
  sevKey,
} from "@/lib/report";
import { FocusPairView, type PairMode } from "./focus-pair";

type Props = {
  runId: string;
  viewport: "desktop" | "mobile";
  url: string;
  size: { w: number; h: number };
  findings: Finding[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  pairMode: PairMode;
  onPairMode: (mode: PairMode) => void;
  focusStops: number;
};

export function Canvas({
  runId,
  viewport,
  url,
  size,
  findings,
  selectedKey,
  onSelect,
  pairMode,
  onPairMode,
  focusStops,
}: Props) {
  const wrapper = useRef<ReactZoomPanPinchRef>(null);
  const frame = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const boxRefs = useRef(new Map<string, SVGGElement>());
  const [labels, setLabels] = useState(false);
  const [minimap, setMinimap] = useState(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const raf = useRef(0);

  const boxes = useMemo(
    () => readingOrder(findings.filter((f) => f.bbox)),
    [findings],
  );
  const painted = useMemo(
    () => [...boxes].sort((a, b) => area(b) - area(a)),
    [boxes],
  );
  const selected = findings.find((f) => f.key === selectedKey) ?? null;
  const tabKey =
    selectedKey && boxes.some((b) => b.key === selectedKey)
      ? selectedKey
      : boxes[0]?.key;
  const animation = prefersReducedMotion() ? 0 : 240;

  const containerSize = useCallback(() => {
    const el = frame.current;
    return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
  }, []);

  const fit = useCallback(
    (time = 0) => {
      const c = containerSize();
      const scale = fitWidth(size.w, c);
      wrapper.current?.setTransform(0, 0, scale, time);
    },
    [containerSize, size.w],
  );

  useEffect(() => {
    if (loaded) fit(0);
  }, [loaded, fit]);

  useEffect(() => {
    if (!selected?.bbox || pairMode !== "page") return;
    const t = fitTransform(selected.bbox, containerSize());
    wrapper.current?.setTransform(t.x, t.y, t.scale, animation);
  }, [selected, pairMode, containerSize, animation]);

  const onTransform = useCallback(
    (
      _: unknown,
      state: { scale: number; positionX: number; positionY: number },
    ) => {
      svg.current?.style.setProperty("--inv", String(1 / state.scale));
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() =>
        setView({ scale: state.scale, x: state.positionX, y: state.positionY }),
      );
    },
    [],
  );

  function focusBox(key: string | undefined) {
    if (!key) return;
    boxRefs.current.get(key)?.focus();
  }

  function onBoxKey(event: KeyboardEvent<SVGGElement>, f: Finding) {
    const index = boxes.findIndex((b) => b.key === f.key);
    const move = (step: number) => {
      event.preventDefault();
      event.stopPropagation();
      focusBox(cycle(boxes, index, step)?.key);
    };
    if (event.shiftKey && event.key.startsWith("Arrow")) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(-1);
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(f.key);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onSelect(null);
    }
  }

  function onFrameKey(event: KeyboardEvent<HTMLDivElement>) {
    const w = wrapper.current;
    if (!w || (event.target as HTMLElement).closest("button, [role=radio]"))
      return;
    const step = 80;
    if (event.key === "+" || event.key === "=") w.zoomIn(0.4, animation);
    else if (event.key === "-" || event.key === "_") w.zoomOut(0.4, animation);
    else if (event.key === "0") fit(animation);
    else if (event.shiftKey && event.key === "ArrowLeft") w.panBy(step, 0);
    else if (event.shiftKey && event.key === "ArrowRight") w.panBy(-step, 0);
    else if (event.shiftKey && event.key === "ArrowUp") w.panBy(0, step);
    else if (event.shiftKey && event.key === "ArrowDown") w.panBy(0, -step);
    else if (event.key === "f" || event.key === "F") {
      if (selected?.focus_index != null)
        onPairMode(pairMode === "page" ? "focused" : "page");
    } else return;
    event.preventDefault();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
  }

  const alt = `Full-page screenshot of ${url}, ${viewport} viewport, ${findings.length} findings; use the findings table for details`;
  const canPair = selected?.focus_index != null && focusStops > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            ref={frame}
            onKeyDown={onFrameKey}
            data-testid="canvas"
            className="relative h-full min-h-96 overflow-hidden bg-muted"
          />
        }
      >
        {pairMode !== "page" && selected?.focus_index != null ? (
          <FocusPairView
            runId={runId}
            viewport={viewport}
            index={selected.focus_index}
            mode={pairMode}
            label={`${selected.sc} ${SC_TITLES[selected.sc] ?? ""}`}
          />
        ) : (
          <TransformWrapper
            ref={wrapper}
            minScale={0.05}
            maxScale={6}
            limitToBounds={false}
            wheel={{ activationKeys: ["Control", "Meta"] }}
            doubleClick={{ disabled: true }}
            onTransform={onTransform}
          >
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: size.w, height: size.h }}
            >
              <div
                className="relative"
                style={{ width: size.w, height: size.h }}
              >
                {/* biome-ignore lint/performance/noImgElement: full-page screenshot served by the API */}
                <img
                  src={`/api/runs/${runId}/assets/${viewport}/screenshot`}
                  alt={alt}
                  width={size.w}
                  height={size.h}
                  onLoad={() => setLoaded(true)}
                  draggable={false}
                  className="block max-w-none select-none"
                />
                <svg
                  ref={svg}
                  viewBox={`0 0 ${size.w} ${size.h}`}
                  width={size.w}
                  height={size.h}
                  className="absolute inset-0"
                  style={{ ["--inv" as string]: 1 }}
                  role="group"
                  aria-label={`${boxes.length} findings on the page`}
                >
                  {painted.map((f) => {
                    const b = f.bbox;
                    if (!b) return null;
                    const key = sevKey(f);
                    const isSel = f.key === selectedKey;
                    const dim = selectedKey !== null && !isSel;
                    return (
                      <g
                        key={f.key}
                        ref={(el) => {
                          if (el) boxRefs.current.set(f.key, el);
                          else boxRefs.current.delete(f.key);
                        }}
                        role="button"
                        tabIndex={f.key === tabKey ? 0 : -1}
                        aria-label={ariaLabel(f)}
                        aria-pressed={isSel}
                        data-key={f.key}
                        data-selected={isSel}
                        className="group cursor-pointer outline-none"
                        style={{ opacity: dim ? 0.4 : 1 }}
                        onClick={() => onSelect(f.key)}
                        onContextMenu={() => onSelect(f.key)}
                        onKeyDown={(e) => onBoxKey(e, f)}
                        onFocus={() => setFocusedKey(f.key)}
                        onBlur={() =>
                          setFocusedKey((k) => (k === f.key ? null : k))
                        }
                      >
                        {focusedKey === f.key ? (
                          <rect
                            x={b.x}
                            y={b.y}
                            width={Math.max(b.w, 1)}
                            height={Math.max(b.h, 1)}
                            fill="none"
                            stroke="var(--accent-focus)"
                            strokeWidth={10}
                            vectorEffect="non-scaling-stroke"
                          />
                        ) : null}
                        <rect
                          x={b.x}
                          y={b.y}
                          width={Math.max(b.w, 1)}
                          height={Math.max(b.h, 1)}
                          data-hit="true"
                          fill={`color-mix(in srgb, var(--sev-${key === "needs-review" ? "review" : key}) ${isSel || focusedKey === f.key ? 16 : 8}%, transparent)`}
                          stroke="var(--halo)"
                          strokeWidth={4}
                          vectorEffect="non-scaling-stroke"
                        />
                        <rect
                          x={b.x}
                          y={b.y}
                          width={Math.max(b.w, 1)}
                          height={Math.max(b.h, 1)}
                          fill="none"
                          stroke={`var(--sev-${key === "needs-review" ? "review" : key})`}
                          strokeWidth={key === "needs-review" ? 1.5 : 2}
                          strokeDasharray={SEV_DASH[key]}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          x={b.x}
                          y={b.y}
                          dy="-0.3em"
                          className="pointer-events-none select-none"
                          style={{
                            fontSize: "calc(12px * var(--inv))",
                            fill: `var(--sev-${key === "needs-review" ? "review" : key})`,
                            paintOrder: "stroke",
                            stroke: "var(--halo)",
                            strokeWidth: "calc(3px * var(--inv))",
                            fontWeight: 600,
                          }}
                        >
                          {SEV_GLYPH[key]}
                          {labels || isSel || focusedKey === f.key
                            ? ` ${f.sc} ${SC_TITLES[f.sc] ?? ""}`
                            : ""}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </TransformComponent>
          </TransformWrapper>
        )}

        {minimap && pairMode === "page" ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3 w-36 overflow-hidden rounded-md border bg-background"
          >
            {/* biome-ignore lint/performance/noImgElement: thumbnail of the same screenshot */}
            <img
              src={`/api/runs/${runId}/assets/${viewport}/screenshot`}
              alt=""
              className="block w-full"
            />
            <div
              className="absolute border-2 border-accent-focus"
              style={{
                left: `${Math.max(0, (-view.x / view.scale / size.w) * 100)}%`,
                top: `${Math.max(0, (-view.y / view.scale / size.h) * 100)}%`,
                width: `${Math.min(100, ((frame.current?.clientWidth ?? 0) / view.scale / size.w) * 100)}%`,
                height: `${Math.min(100, ((frame.current?.clientHeight ?? 0) / view.scale / size.h) * 100)}%`,
              }}
            />
          </div>
        ) : null}

        <div
          role="toolbar"
          aria-label="Canvas controls"
          className="absolute inset-x-0 bottom-3 mx-auto flex w-max max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-lg border bg-popover p-1 shadow-md"
        >
          {pairMode === "page" ? (
            <>
              <Tip label="Zoom out" kbd="−">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Zoom out"
                  onClick={() => wrapper.current?.zoomOut(0.4, animation)}
                >
                  <Minus aria-hidden="true" />
                </Button>
              </Tip>
              <Tip label="Zoom in" kbd="+">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Zoom in"
                  onClick={() => wrapper.current?.zoomIn(0.4, animation)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </Tip>
              <Tip label="Fit width" kbd="0">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Fit to width"
                  onClick={() => fit(animation)}
                >
                  <Maximize aria-hidden="true" />
                </Button>
              </Tip>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Zoom to 100 percent"
                onClick={() =>
                  wrapper.current?.setTransform(view.x, view.y, 1, animation)
                }
              >
                100%
              </Button>
              <Button
                variant={labels ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={labels}
                onClick={() => setLabels((v) => !v)}
              >
                Labels
              </Button>
              <Button
                variant={minimap ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={minimap}
                onClick={() => setMinimap((v) => !v)}
              >
                <ScanLine aria-hidden="true" />
                Minimap
              </Button>
            </>
          ) : null}
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[pairMode === "page" ? "page" : pairMode]}
            onValueChange={(v) => v[0] && onPairMode(v[0] as PairMode)}
            aria-label="Focus pair view"
          >
            <ToggleGroupItem value="page" aria-label="Page view">
              Page
            </ToggleGroupItem>
            <ToggleGroupItem value="focused" disabled={!canPair}>
              Focused
            </ToggleGroupItem>
            <ToggleGroupItem value="unfocused" disabled={!canPair}>
              Unfocused
            </ToggleGroupItem>
            <ToggleGroupItem value="diff" disabled={!canPair}>
              Diff
            </ToggleGroupItem>
          </ToggleGroup>
          <Kbd aria-hidden="true">F</Kbd>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={!selected}
          onClick={() => selected && copy(selected.element)}
        >
          Copy selector
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!selected}
          onClick={() =>
            selected &&
            copy(
              selected.evidence_rows
                .map((r) => `${r.label}: ${r.value}`)
                .join("\n"),
            )
          }
        >
          Copy evidence
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function area(f: Finding) {
  return (f.bbox?.w ?? 0) * (f.bbox?.h ?? 0);
}

function Tip({
  label,
  kbd,
  children,
}: {
  label: string;
  kbd: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>
        {label} <Kbd>{kbd}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
