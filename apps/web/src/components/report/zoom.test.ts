import { describe, expect, it } from "vitest";
import { wheelPixels, wheelZoomFactor, zoomAround } from "./zoom";

describe("zoomAround", () => {
  it("keeps the point under the cursor fixed", () => {
    const state = { x: 40, y: -20, scale: 0.8 };
    const px = 300;
    const py = 200;
    const before = {
      cx: (px - state.x) / state.scale,
      cy: (py - state.y) / state.scale,
    };
    const next = zoomAround(state, 1.5, px, py, 0.05, 6);
    expect(next.scale).toBeCloseTo(1.2);
    expect((px - next.x) / next.scale).toBeCloseTo(before.cx);
    expect((py - next.y) / next.scale).toBeCloseTo(before.cy);
  });

  it("clamps to the min and max scale and keeps the point fixed", () => {
    const state = { x: 10, y: 10, scale: 5 };
    const next = zoomAround(state, 10, 100, 100, 0.05, 6);
    expect(next.scale).toBe(6);
    expect((100 - next.x) / 6).toBeCloseTo((100 - 10) / 5);
    expect(zoomAround(state, 0.0001, 0, 0, 0.05, 6).scale).toBe(0.05);
  });

  it("is the identity for a factor of 1", () => {
    const state = { x: 12, y: 34, scale: 2 };
    expect(zoomAround(state, 1, 50, 60, 0.05, 6)).toEqual(state);
  });
});

describe("wheel normalisation", () => {
  it("converts lines and pages to pixels", () => {
    expect(wheelPixels(3, 0)).toBe(3);
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(1, 2)).toBe(800);
  });

  it("gives a 10-15 percent step for a mouse notch", () => {
    const up = wheelZoomFactor(-100, 0);
    expect(up).toBeGreaterThan(1.1);
    expect(up).toBeLessThan(1.15);
    expect(wheelZoomFactor(100, 0)).toBeCloseTo(1 / up);
  });

  it("zooms smoothly for small pinch deltas", () => {
    const f = wheelZoomFactor(-4, 0);
    expect(f).toBeGreaterThan(1.03);
    expect(f).toBeLessThan(1.05);
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48, 0));
  });
});
