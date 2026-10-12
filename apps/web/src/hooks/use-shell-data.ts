"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useReviewWaiting(): number | null {
  const { data } = useQuery({
    queryKey: ["review", "waiting-count"],
    queryFn: async () => {
      const { data: body, error } = await api.GET("/review", {
        params: { query: { state: "waiting", limit: 1 } },
      });
      if (error || !body) throw new Error("Review queue unavailable");
      return body.total;
    },
    retry: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  return typeof data === "number" ? data : null;
}

export function useShellRuns() {
  return useQuery({
    queryKey: ["runs", "shell"],
    queryFn: async () => {
      const { data, error } = await api.GET("/runs", {
        params: { query: { limit: 30 } },
      });
      if (error || !data) throw new Error("Could not load recent runs");
      return data;
    },
    retry: false,
    staleTime: 5_000,
  });
}
