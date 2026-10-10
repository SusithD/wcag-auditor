"use client";

import { useEffect, useState } from "react";
import type { StageEvent } from "@/lib/stages";

export function useRunEvents(runId: string, enabled: boolean) {
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onopen = () => setConnected(true);
    source.addEventListener("stage", (message) => {
      const event = JSON.parse(
        (message as MessageEvent<string>).data,
      ) as StageEvent;
      setEvents((previous) => [...previous, event]);
      if (event.stage === "done" || event.stage.startsWith("failed"))
        setConnected(true);
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [runId, enabled]);

  return { events, connected };
}
