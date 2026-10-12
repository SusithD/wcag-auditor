export type Transform = { x: number; y: number; scale: number };

const LINE_PX = 16;
const PAGE_PX = 800;
const NOTCH_K = 0.00115;
const PINCH_K = 0.01;
const PINCH_BELOW = 40;

export function wheelPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * LINE_PX;
  if (deltaMode === 2) return delta * PAGE_PX;
  return delta;
}

export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px = wheelPixels(deltaY, deltaMode);
  const k = Math.abs(px) < PINCH_BELOW ? PINCH_K : NOTCH_K;
  return Math.exp(-px * k);
}

export function zoomAround(
  state: Transform,
  factor: number,
  px: number,
  py: number,
  min: number,
  max: number,
): Transform {
  const scale = Math.min(max, Math.max(min, state.scale * factor));
  const ratio = scale / state.scale;
  return {
    scale,
    x: px - (px - state.x) * ratio,
    y: py - (py - state.y) * ratio,
  };
}
