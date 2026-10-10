"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { CompareData } from "@/lib/compare";
import type { Viewport } from "@/lib/report";

export function useCompare(runId: string, viewport: Viewport | undefined) {
  return useQuery({
    enabled: !!viewport,
    queryKey: ["compare", runId, viewport],
    retry: false,
    queryFn: async (): Promise<CompareData> => {
      const { data, error, response } = await api.GET(
        "/runs/{run_id}/compare",
        {
          params: {
            path: { run_id: runId },
            query: { viewport: viewport as Viewport },
          },
        },
      );
      if (error || !data)
        throw new Error(response.status === 404 ? "unavailable" : "failed");
      return data;
    },
  });
}

export function useCatalogue() {
  return useQuery({
    queryKey: ["catalogue"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET("/catalogue");
      if (error || !data)
        throw new Error("The check catalogue could not be loaded");
      return data;
    },
  });
}
