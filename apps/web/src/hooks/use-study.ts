"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/types";

export type SessionState = components["schemas"]["SessionState"];
export type Materials = components["schemas"]["Materials"];
export type TaskView = components["schemas"]["TaskView"];

function fail(error: unknown, fallback: string): never {
  const detail = (error as { detail?: unknown } | undefined)?.detail;
  throw new Error(typeof detail === "string" ? detail : fallback);
}

export function useMaterials() {
  return useQuery({
    queryKey: ["study", "materials"],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const { data, error } = await api.GET("/study/materials");
      if (error || !data) fail(error, "The study text could not be loaded");
      return data;
    },
  });
}

export function useStudyConfig() {
  return useQuery({
    queryKey: ["study", "config"],
    queryFn: async () => {
      const { data, error } = await api.GET("/study/config");
      if (error || !data)
        fail(error, "The study configuration could not be loaded");
      return data;
    },
  });
}

export function useSession(code: string) {
  return useQuery({
    queryKey: ["study", "session", code],
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET("/study/sessions/{code}", {
        params: { path: { code } },
      });
      if (error || !data) fail(error, "This participant code was not found");
      return data;
    },
  });
}

export function useStudyAction<T>(
  code: string,
  call: (input: T) => Promise<{ data?: SessionState; error?: unknown }>,
  fallback = "That could not be saved",
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      const { data, error } = await call(input);
      if (error || !data) fail(error, fallback);
      return data;
    },
    onSuccess: (data) => client.setQueryData(["study", "session", code], data),
  });
}
