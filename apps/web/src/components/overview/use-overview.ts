"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { isActive } from "@/lib/overview";

export function useSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data, error } = await api.GET("/sites");
      if (error || !data) throw new Error("Could not load sites");
      return data;
    },
    refetchInterval: (query) =>
      query.state.data?.some((row) =>
        isActive((row.newer_run ?? row.latest_run).status),
      )
        ? 3000
        : false,
  });
}

export function useWeek() {
  return useQuery({
    queryKey: ["summary", "week"],
    queryFn: async () => {
      const { data, error } = await api.GET("/summary/week");
      if (error || !data) throw new Error("Could not load the weekly summary");
      return data;
    },
    refetchInterval: (query) =>
      (query.state.data?.running.length ?? 0) > 0 ? 3000 : false,
  });
}

export function useReviewSummary() {
  return useQuery({
    queryKey: ["review", "overview"],
    queryFn: async () => {
      const { data, error } = await api.GET("/review", {
        params: { query: { state: "waiting", limit: 1 } },
      });
      if (error || !data) throw new Error("Could not load the review queue");
      return data;
    },
  });
}
