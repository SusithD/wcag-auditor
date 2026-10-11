"use client";

import { useEffect, useRef, useState } from "react";
import { diffPixels } from "@/lib/report";

export type PairMode = "page" | "focused" | "unfocused" | "diff";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed"));
    img.src = src;
  });
}

export function FocusPairView({
  runId,
  viewport,
  index,
  mode,
  label,
}: {
  runId: string;
  viewport: string;
  index: number;
  mode: Exclude<PairMode, "page">;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const base = `/api/runs/${runId}/assets/${viewport}/focus/${index}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new image pair clears an earlier failure
  useEffect(() => setFailed(false), [mode, base]);

  useEffect(() => {
    if (mode !== "diff") return;
    let cancelled = false;
    setFailed(false);
    Promise.all([load(`${base}/on`), load(`${base}/off`)])
      .then(([on, off]) => {
        const el = canvas.current;
        if (cancelled || !el) return;
        const w = Math.min(on.width, off.width);
        const h = Math.min(on.height, off.height);
        el.width = w;
        el.height = h;
        const ctx = el.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(on, 0, 0);
        const a = ctx.getImageData(0, 0, w, h);
        ctx.drawImage(off, 0, 0);
        const b = ctx.getImageData(0, 0, w, h);
        const out = new ImageData(
          diffPixels(a.data, b.data) as Uint8ClampedArray<ArrayBuffer>,
          w,
          h,
        );
        ctx.putImageData(out, 0, 0);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [mode, base]);

  return (
    <div
      tabIndex={0}
      data-pair-region="true"
      role="region"
      aria-label={`Focus pair view for ${label}`}
      className="flex h-full w-full items-start justify-center overflow-auto p-3 pb-16"
    >
      {failed ? (
        <p role="alert" className="text-body text-muted-foreground">
          The focus images for this stop could not be loaded.
        </p>
      ) : mode === "diff" ? (
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Pixels that changed when keyboard focus reached the control for ${label}; changed pixels are red`}
          className="h-auto max-w-full rounded-md border bg-background"
        />
      ) : (
        // biome-ignore lint/performance/noImgElement: viewport image served by the API
        <img
          src={`${base}/${mode === "focused" ? "on" : "off"}`}
          alt={`Viewport ${mode === "focused" ? "with" : "without"} keyboard focus on the control for ${label}`}
          className="h-auto max-w-full rounded-md border bg-background"
        />
      )}
    </div>
  );
}
