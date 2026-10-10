import type { components } from "@/api/types";

export type CompareData = components["schemas"]["CompareOut"];

export function counterpart(
  pairs: CompareData["pairs"],
  side: "hybrid" | "rule_only",
  key: string | null,
): string | null {
  if (!key) return null;
  const other = side === "hybrid" ? "rule_only" : "hybrid";
  return pairs.find((p) => p[side] === key)?.[other] ?? null;
}

export type SyncView = { x: number; y: number; scale: number };

export class SyncBus {
  private listeners = new Map<string, (view: SyncView) => void>();

  subscribe(id: string, listener: (view: SyncView) => void): () => void {
    this.listeners.set(id, listener);
    return () => this.listeners.delete(id);
  }

  publish(source: string, view: SyncView) {
    for (const [id, listener] of this.listeners)
      if (id !== source) listener(view);
  }
}
