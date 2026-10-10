"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ExportInfo, Finding, Overview, Viewport } from "@/lib/report";

export function useOverview(runId: string, viewport: Viewport | undefined) {
  return useQuery({
    enabled: !!viewport,
    queryKey: ["overview", runId, viewport],
    queryFn: async (): Promise<Overview> => {
      const { data, error } = await api.GET("/runs/{run_id}/overview", {
        params: {
          path: { run_id: runId },
          query: { viewport: viewport as Viewport },
        },
      });
      if (error || !data)
        throw new Error("The report overview could not be loaded");
      return data;
    },
  });
}

export function useFindings(runId: string, viewport: Viewport | undefined) {
  return useQuery({
    enabled: !!viewport,
    queryKey: ["findings", runId, viewport],
    queryFn: async (): Promise<Finding[]> => {
      const { data, error } = await api.GET("/runs/{run_id}/findings", {
        params: {
          path: { run_id: runId },
          query: { viewport: viewport as Viewport },
        },
      });
      if (error || !data) throw new Error("The findings could not be loaded");
      return data;
    },
  });
}

export function useExports(
  runId: string,
  viewport: Viewport | undefined,
  enabled: boolean,
) {
  return useQuery({
    enabled: !!viewport && enabled,
    queryKey: ["exports", runId, viewport],
    queryFn: async (): Promise<ExportInfo[]> => {
      const { data, error } = await api.GET("/runs/{run_id}/exports", {
        params: {
          path: { run_id: runId },
          query: { viewport: viewport as Viewport },
        },
      });
      if (error || !data) throw new Error("The exports could not be listed");
      return data;
    },
  });
}

export function useSetStatus(runId: string, viewport: Viewport | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      status: "open" | "fixed" | "ignored";
    }) => {
      const { data, error } = await api.PATCH("/findings/{finding_id}", {
        params: { path: { finding_id: vars.id } },
        body: { status: vars.status },
      });
      if (error || !data) throw new Error("The status could not be saved");
      return data;
    },
    onSuccess: (updated) => {
      client.setQueryData<Finding[]>(["findings", runId, viewport], (old) =>
        old?.map((f) => (f.id === updated.id ? updated : f)),
      );
    },
  });
}
