"use client";

import { useEffect, useState } from "react";
import type { StageEvent } from "@/lib/stages";

const TERMINAL_STAGES = new Set(["done", "partial", "failed", "cancelled"]);

export function useRunEvents(runId: string, enabled: boolean) {
  const [events, setEvents] = useState<StageEvent[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onopen = () => setEvents([]);
    source.addEventListener("stage", (message) => {
      const event = JSON.parse(
        (message as MessageEvent<string>).data,
      ) as StageEvent;
      setEvents((previous) => [...previous, event]);
      if (
        TERMINAL_STAGES.has(event.stage) ||
        event.stage.startsWith("failed:run")
      )
        source.close();
    });
    return () => source.close();
  }, [runId, enabled]);

  return { events };
}
