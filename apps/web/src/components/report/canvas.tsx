"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import { StatusShape } from "@/components/ds";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { prefersReducedMotion } from "@/hooks/use-media-query";
import type { SyncBus } from "@/lib/compare";
import {
  ariaLabel,
  cycle,
  type Finding,
  fitTransform,
  readingOrder,
  SC_TITLES,
  sevKey,
} from "@/lib/report";
import { cn } from "@/lib/utils";
import { FocusPairView, type PairMode } from "./focus-pair";
import { focusWhenReady } from "./focus-when-ready";
import { kindOf, SvgGlyph } from "./glyph";
import { isEstimated } from "./logic";
import { Seg } from "./seg";
import { wheelPixels, wheelZoomFactor, zoomAround } from "./zoom";

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;
const PAD_L = 24;
const PAD_R = 40;
const PAD_T = 32;
const PAD_B = 24;
const PIN_SMALL_BELOW = 0.5;
const PIN_SMALL_FACTOR = 0.8;

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
  label?: string;
  sync?: { bus: SyncBus; id: string };
  onAnnounce?: (message: string) => void;
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
  label,
  sync,
  onAnnounce,
}: Props) {
  const uid = useId();
  const wrapper = useRef<ReactZoomPanPinchRef>(null);
  const frame = useRef<HTMLDivElement>(null);
  const well = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const boxRefs = useRef(new Map<string, SVGGElement>());
  const [labels, setLabels] = useState(findings.length <= 8);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0, fit: true });
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [rovingKey, setRovingKey] = useState<string | null>(null);
  const pendingFocus = useRef<"pair" | "box" | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [wellWidth, setWellWidth] = useState(0);
  const raf = useRef(0);
  const autoFit = useRef(true);
  const applying = useRef(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const boxes = useMemo(
    () => readingOrder(findings.filter((f) => f.bbox)),
    [findings],
  );
  const selected = findings.find((f) => f.key === selectedKey) ?? null;
  const tabKey =
    rovingKey && boxes.some((b) => b.key === rovingKey)
      ? rovingKey
      : selectedKey && boxes.some((b) => b.key === selectedKey)
        ? selectedKey
        : boxes[0]?.key;
  const animation = prefersReducedMotion() ? 0 : 240;

  const containerSize = useCallback(() => {
    const el = well.current;
    return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
  }, []);

  const fit = useCallback(
    (time = 0) => {
      const c = containerSize();
      const room = Math.max(c.w - PAD_L - PAD_R, 1);
      const scale = Math.min(1, room / Math.max(size.w, 1));
      autoFit.current = true;
      wrapper.current?.setTransform(
        PAD_L + (room - size.w * scale) / 2,
        PAD_T,
        scale,
        time,
      );
    },
    [containerSize, size.w],
  );

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectedKeyNow = selected?.key;

  useEffect(() => {
    if (!loaded) return;
    const current = selectedRef.current;
    if (current?.bbox) {
      const t = fitTransform(current.bbox, containerSize());
      autoFit.current = false;
      wrapper.current?.setTransform(t.x, t.y, t.scale, 0);
    } else fit(0);
  }, [loaded, fit, containerSize]);

  useEffect(() => {
    const el = well.current;
    if (!el || !loaded) return;
    setWellWidth(el.clientWidth);
    const observer = new ResizeObserver(() => {
      setWellWidth(el.clientWidth);
      if (autoFit.current && !selectedRef.current?.bbox) fit(0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loaded, fit]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refit only when the selected finding changes, not when its status does
  useEffect(() => {
    const current = selectedRef.current;
    if (!loaded || !current?.bbox || pairMode !== "page") return;
    const t = fitTransform(current.bbox, containerSize());
    autoFit.current = false;
    wrapper.current?.setTransform(t.x, t.y, t.scale, animation);
  }, [selectedKeyNow, pairMode, loaded, containerSize, animation]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per pair-mode change, using the flag set by the F key
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (!target) return;
    return focusWhenReady(() => {
      if (target === "pair")
        return pairMode === "page"
          ? null
          : frame.current?.querySelector<HTMLElement>("[data-pair-region]");
      if (pairMode !== "page") return null;
      const box = selectedKey ? boxRefs.current.get(selectedKey) : null;
      return box ?? frame.current;
    });
  }, [pairMode]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new focus target re-shows its label
  useEffect(() => setDismissedKey(null), [focusedKey]);

  function ensureVisible(f: Finding) {
    const w = wrapper.current;
    const b = f.bbox;
    if (!w || !b) return;
    const { scale, positionX, positionY } = w.state;
    const c = containerSize();
    const left = positionX + b.x * scale;
    const top = positionY + b.y * scale;
    if (
      left >= 48 &&
      top >= 48 &&
      left + b.w * scale <= c.w - 48 &&
      top + b.h * scale <= c.h - 48
    )
      return;
    w.setTransform(
      c.w / 2 - (b.x + b.w / 2) * scale,
      c.h / 2 - (b.y + b.h / 2) * scale,
      scale,
      animation,
    );
  }

  function zoomToActual() {
    const w = wrapper.current;
    if (!w) return;
    autoFit.current = false;
    const { scale, positionX, positionY } = w.state;
    const c = containerSize();
    const cx = (c.w / 2 - positionX) / scale;
    const cy = (c.h / 2 - positionY) / scale;
    w.setTransform(c.w / 2 - cx, c.h / 2 - cy, 1, animation);
  }

  const pairModeRef = useRef(pairMode);
  pairModeRef.current = pairMode;

  useEffect(() => {
    const el = well.current;
    if (!el) return;

    function zoomAtClient(factor: number, clientX: number, clientY: number) {
      const w = wrapper.current;
      if (!w || !el) return;
      const rect = el.getBoundingClientRect();
      const { scale, positionX, positionY } = w.state;
      const next = zoomAround(
        { x: positionX, y: positionY, scale },
        factor,
        clientX - rect.left,
        clientY - rect.top,
        MIN_SCALE,
        MAX_SCALE,
      );
      autoFit.current = false;
      w.setTransform(next.x, next.y, next.scale, 0);
    }

    function onWheel(event: WheelEvent) {
      if (pairModeRef.current !== "page") {
        if (event.ctrlKey || event.metaKey) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomAtClient(
          wheelZoomFactor(event.deltaY, event.deltaMode),
          event.clientX,
          event.clientY,
        );
        return;
      }
      autoFit.current = false;
      wrapper.current?.panBy(
        -wheelPixels(event.deltaX, event.deltaMode),
        -wheelPixels(event.deltaY, event.deltaMode),
      );
    }

    let lastGesture = 1;
    function onGestureStart(event: Event) {
      event.preventDefault();
      lastGesture = 1;
    }
    function onGestureChange(event: Event) {
      event.preventDefault();
      const g = event as Event & {
        scale: number;
        clientX: number;
        clientY: number;
      };
      if (pairModeRef.current !== "page" || !g.scale) return;
      const factor = g.scale / lastGesture;
      lastGesture = g.scale;
      zoomAtClient(factor, g.clientX, g.clientY);
    }
    function onGestureEnd(event: Event) {
      event.preventDefault();
      lastGesture = 1;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart, { passive: false });
    el.addEventListener("gesturechange", onGestureChange, { passive: false });
    el.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
  }, []);

  const onTransform = useCallback(
    (
      _: unknown,
      state: { scale: number; positionX: number; positionY: number },
    ) => {
      svg.current?.style.setProperty("--inv", String(1 / state.scale));
      svg.current?.style.setProperty(
        "--pin",
        String(
          (state.scale < PIN_SMALL_BELOW ? PIN_SMALL_FACTOR : 1) / state.scale,
        ),
      );
      if (sync && !applying.current) {
        sync.bus.publish(sync.id, {
          x: state.positionX,
          y: state.positionY,
          scale: state.scale,
        });
      }
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() =>
        setView({
          scale: state.scale,
          x: state.positionX,
          y: state.positionY,
          fit: autoFit.current,
        }),
      );
    },
    [sync],
  );

  useEffect(() => {
    if (!sync) return;
    return sync.bus.subscribe(sync.id, (v) => {
      applying.current = true;
      autoFit.current = false;
      wrapper.current?.setTransform(v.x, v.y, v.scale, 0);
      setTimeout(() => {
        applying.current = false;
      }, 80);
    });
  }, [sync]);

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
      setDismissedKey(f.key);
      onSelect(null);
    }
  }

  function onFrameKey(event: KeyboardEvent<HTMLDivElement>) {
    const w = wrapper.current;
    if (!w || pairMode !== "page") {
      if ((event.key === "f" || event.key === "F") && canPair) {
        pendingFocus.current = pairMode === "page" ? "pair" : "box";
        onPairMode(pairMode === "page" ? "focused" : "page");
        event.preventDefault();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const step = 80;
    if (["+", "=", "-", "_"].includes(event.key) || event.shiftKey)
      autoFit.current = false;
    if (event.key === "+" || event.key === "=") w.zoomIn(0.4, animation);
    else if (event.key === "-" || event.key === "_") w.zoomOut(0.4, animation);
    else if (event.key === "0") fit(animation);
    else if (event.shiftKey && event.key === "ArrowLeft") w.panBy(step, 0);
    else if (event.shiftKey && event.key === "ArrowRight") w.panBy(-step, 0);
    else if (event.shiftKey && event.key === "ArrowUp") w.panBy(0, step);
    else if (event.shiftKey && event.key === "ArrowDown") w.panBy(0, -step);
    else if (event.key === "f" || event.key === "F") {
      if (!canPair) return;
      pendingFocus.current = "pair";
      onPairMode("focused");
    } else return;
    event.preventDefault();
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      onAnnounce?.(message);
    } catch {
      return;
    }
  }

  const alt = `${label ? `${label}: ` : ""}Full-page screenshot of ${url}, ${viewport} viewport, ${findings.length} findings; use the findings table for details`;
  const canPair = selected?.focus_index != null && focusStops > 0;
  const fitScale = Math.min(
    1,
    Math.max(wellWidth - PAD_L - PAD_R, 1) / Math.max(size.w, 1),
  );
  const fitHeight = Math.ceil(size.h * fitScale) + PAD_T + PAD_B;
  const pct = Math.round(view.scale * 100);
  const zoomLabel = `${view.fit ? "Fit, " : ""}${pct}%`;

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) return;
        setTimeout(
          () =>
            focusWhenReady(() => {
              const box = selectedKey ? boxRefs.current.get(selectedKey) : null;
              return box ?? frame.current;
            }),
          0,
        );
      }}
    >
      <ContextMenuTrigger
        render={
          <div
            ref={frame}
            onKeyDown={onFrameKey}
            data-testid="canvas"
            role="group"
            aria-label={`${label ? `${label} ` : ""}screenshot canvas`}
            tabIndex={boxes.length === 0 ? 0 : -1}
            className="flex h-full min-h-96 flex-col bg-subtle max-lg:h-auto max-lg:min-h-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          />
        }
      >
        <div
          ref={well}
          style={{ ["--fit-h" as string]: `${fitHeight}px` }}
          className={cn(
            "relative min-h-0 flex-1 touch-none overflow-hidden max-lg:flex-none",
            view.fit && pairMode === "page"
              ? "max-lg:h-[min(var(--fit-h),75dvh)]"
              : "max-lg:h-[max(var(--fit-h),70dvh)]",
            "bg-[radial-gradient(var(--line)_1px,transparent_1px)] bg-size-[16px_16px]",
          )}
        >
          {pairMode !== "page" && selected?.focus_index != null ? (
            <div className="absolute inset-0">
              <FocusPairView
                runId={runId}
                viewport={viewport}
                index={selected.focus_index}
                mode={pairMode}
                label={`${selected.sc} ${SC_TITLES[selected.sc] ?? ""}`}
              />
            </div>
          ) : (
            <div className="absolute inset-0">
              <TransformWrapper
                ref={wrapper}
                minScale={MIN_SCALE}
                maxScale={MAX_SCALE}
                limitToBounds={false}
                wheel={{ disabled: true }}
                pinch={{ disabled: false }}
                doubleClick={{ disabled: true }}
                onTransform={onTransform}
                onPanningStart={() => {
                  autoFit.current = false;
                }}
                onZoomStart={() => {
                  autoFit.current = false;
                }}
              >
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{ width: size.w, height: size.h }}
                >
                  <div
                    className="relative rounded-[4px] bg-white shadow-[0_0_0_1px_var(--line),0_12px_28px_-12px_rgb(0_0_55/0.22)]"
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
                      className="block max-w-none select-none dark:brightness-90"
                    />
                    <svg
                      ref={svg}
                      viewBox={`0 0 ${size.w} ${size.h}`}
                      width={size.w}
                      height={size.h}
                      className="absolute inset-0 overflow-visible"
                      style={{ ["--inv" as string]: 1, ["--pin" as string]: 1 }}
                      role="group"
                      aria-label={`${label ? `${label}: ` : ""}${boxes.length} findings on the page`}
                    >
                      {boxes.map((f, position) => {
                        const b = f.bbox;
                        if (!b) return null;
                        const key = sevKey(f);
                        const isSel = f.key === selectedKey;
                        const isFocus = focusedKey === f.key;
                        const dim = selectedKey !== null && !isSel;
                        const colour = isSel
                          ? "var(--accent)"
                          : `var(--${key === "needs-review" ? "review" : key})`;
                        const strokeWidth = isSel ? 3 : 2;
                        const showTag =
                          ((labels && view.scale >= PIN_SMALL_BELOW) ||
                            isSel ||
                            isFocus) &&
                          dismissedKey !== f.key;
                        const tagWidth = showTag ? 26 + f.sc.length * 6.6 : 20;
                        const w = Math.max(b.w, 1);
                        const h = Math.max(b.h, 1);
                        return (
                          <g
                            key={f.key}
                            ref={(el) => {
                              if (el) boxRefs.current.set(f.key, el);
                              else boxRefs.current.delete(f.key);
                            }}
                            role="button"
                            tabIndex={f.key === tabKey ? 0 : -1}
                            aria-label={ariaLabel(
                              f,
                              position + 1,
                              boxes.length,
                            )}
                            aria-describedby={`${uid}-${f.key}`}
                            aria-pressed={isSel}
                            data-key={f.key}
                            data-sev={key}
                            data-selected={isSel}
                            data-estimated={isEstimated(f)}
                            className="group cursor-pointer outline-none"
                            onClick={() => onSelect(f.key)}
                            onContextMenu={() => onSelect(f.key)}
                            onKeyDown={(e) => onBoxKey(e, f)}
                            onFocus={() => {
                              setFocusedKey(f.key);
                              setRovingKey(f.key);
                              ensureVisible(f);
                            }}
                            onBlur={() =>
                              setFocusedKey((k) => (k === f.key ? null : k))
                            }
                          >
                            <desc id={`${uid}-${f.key}`}>{f.element}</desc>
                            {isFocus ? (
                              <>
                                <rect
                                  x={b.x}
                                  y={b.y}
                                  width={w}
                                  height={h}
                                  fill="none"
                                  stroke="var(--halo)"
                                  strokeWidth={16}
                                  vectorEffect="non-scaling-stroke"
                                />
                                <rect
                                  x={b.x}
                                  y={b.y}
                                  width={w}
                                  height={h}
                                  fill="none"
                                  stroke="var(--ring)"
                                  strokeWidth={10}
                                  vectorEffect="non-scaling-stroke"
                                />
                              </>
                            ) : null}
                            <rect
                              x={b.x}
                              y={b.y}
                              width={w}
                              height={h}
                              rx={3}
                              data-hit="true"
                              opacity={dim ? 0.45 : 1}
                              fill={`color-mix(in srgb, ${colour} ${isSel ? 7 : 5}%, transparent)`}
                              stroke="var(--halo)"
                              strokeWidth={strokeWidth + 4}
                              vectorEffect="non-scaling-stroke"
                            />
                            <rect
                              x={b.x}
                              y={b.y}
                              width={w}
                              height={h}
                              rx={3}
                              fill="none"
                              stroke={colour}
                              strokeWidth={strokeWidth}
                              strokeDasharray={
                                isEstimated(f) ? "6 4" : undefined
                              }
                              data-stroke="true"
                              opacity={dim ? 0.45 : 1}
                              vectorEffect="non-scaling-stroke"
                            />
                            {dismissedKey !== f.key ? (
                              <g
                                className="pointer-events-none select-none"
                                opacity={dim ? 0.7 : 1}
                                style={{
                                  transform: `translate(${b.x}px, ${b.y}px) scale(var(--pin)) translate(0px, -24px)`,
                                }}
                              >
                                <rect
                                  width={tagWidth}
                                  height={20}
                                  rx={5}
                                  fill={
                                    isSel ? "var(--accent)" : "var(--surface)"
                                  }
                                  stroke={colour}
                                  strokeWidth={1.5}
                                />
                                <SvgGlyph
                                  kind={kindOf(key)}
                                  x={6}
                                  y={5}
                                  size={10}
                                  color={isSel ? "var(--on-accent)" : colour}
                                />
                                {showTag ? (
                                  <text
                                    x={20}
                                    y={14}
                                    fontSize={11}
                                    fontFamily="var(--font-geist-mono), monospace"
                                    fill={
                                      isSel ? "var(--on-accent)" : "var(--ink)"
                                    }
                                  >
                                    {f.sc}
                                  </text>
                                ) : null}
                              </g>
                            ) : null}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </TransformComponent>
              </TransformWrapper>
            </div>
          )}

          {pairMode === "page" ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-6 right-3.5 bottom-6 w-2.5 rounded-full bg-track"
            >
              <span
                className="absolute -right-[3px] -left-[3px] rounded-[4px] border-[1.5px] border-ink-3"
                style={{
                  top: `${Math.min(95, Math.max(0, (-view.y / view.scale / size.h) * 100))}%`,
                  height: `${Math.min(100, ((well.current?.clientHeight ?? 0) / view.scale / size.h) * 100)}%`,
                }}
              />
              {boxes.map((f) => {
                const b = f.bbox;
                if (!b) return null;
                const key = sevKey(f);
                return (
                  <span
                    key={f.key}
                    className="absolute left-0 -translate-y-1/2"
                    style={{
                      top: `${Math.min(100, Math.max(0, ((b.y + b.h / 2) / size.h) * 100))}%`,
                    }}
                  >
                    <StatusShape
                      kind={key === "needs-review" ? "review" : key}
                      className="size-2.5"
                    />
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        <div
          role="toolbar"
          aria-label={`${label ? `${label} ` : ""}canvas controls`}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-line bg-surface px-3 py-2"
        >
          {pairMode === "page" ? (
            <div className="flex items-center gap-0.5">
              <Tip label="Zoom out" kbd="−">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom out"
                  onClick={() => wrapper.current?.zoomOut(0.4, animation)}
                >
                  <Minus aria-hidden="true" />
                </Button>
              </Tip>
              <span className="num min-w-16 text-center text-dense text-ink-2">
                {zoomLabel}
              </span>
              <Tip label="Zoom in" kbd="+">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom in"
                  onClick={() => wrapper.current?.zoomIn(0.4, animation)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </Tip>
              <Tip label="Fit width" kbd="0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fit to width"
                  onClick={() => fit(animation)}
                >
                  <Maximize aria-hidden="true" />
                </Button>
              </Tip>
              <Button
                variant="ghost"
                size="sm"
                aria-label="100% zoom"
                onClick={zoomToActual}
              >
                100%
              </Button>
            </div>
          ) : null}
          {pairMode === "page" ? (
            <div
              role="group"
              aria-label="Box legend"
              className="flex gap-4 text-xs text-ink-2 max-[720px]:hidden"
            >
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-[18px] rounded-[2px] border-2 border-ink-2" />
                Measured
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-[18px] rounded-[2px] border-2 border-dashed border-ink-2" />
                Estimated by the detector
              </span>
            </div>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {pairMode === "page" ? (
              <Seg<"labels" | "boxes">
                small
                label="Labels"
                value={labels ? "labels" : "boxes"}
                onChange={(v) => setLabels(v === "labels")}
                options={[
                  { value: "labels", label: "Labels" },
                  { value: "boxes", label: "Boxes only" },
                ]}
              />
            ) : null}
            {canPair || pairMode !== "page" ? (
              <>
                <Seg<PairMode>
                  small
                  label={`${label ? `${label} ` : ""}focus pair view`}
                  value={pairMode}
                  onChange={onPairMode}
                  options={[
                    { value: "page", label: "Page", name: "Page view" },
                    { value: "focused", label: "Focused", disabled: !canPair },
                    {
                      value: "unfocused",
                      label: "Unfocused",
                      disabled: !canPair,
                    },
                    { value: "diff", label: "Diff", disabled: !canPair },
                  ]}
                />
                <Kbd aria-hidden="true">F</Kbd>
              </>
            ) : null}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent finalFocus={false}>
        <ContextMenuItem
          disabled={!selected}
          onClick={() => selected && copy(selected.element, "Selector copied")}
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
              "Evidence copied",
            )
          }
        >
          Copy evidence
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
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
