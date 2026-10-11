"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RunSummary } from "@/api/client";
import type { components } from "@/api/types";
import type { Finding, Viewport } from "@/lib/report";

export type Delta = components["schemas"]["DeltaOut"];
export type DecisionStatus = components["schemas"]["FindingPatch"]["status"];

export function useDelta(runId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["delta", runId],
    queryFn: async (): Promise<Delta> => {
      const { data, error } = await api.GET("/runs/{run_id}/delta", {
        params: { path: { run_id: runId } },
      });
      if (error || !data) throw new Error("The comparison could not be loaded");
      return data;
    },
  });
}

export type DecisionVars = {
  id: number;
  status: DecisionStatus;
  reason?: string;
  note?: string;
};

export function useDecideFinding(
  runId: string,
  viewport: Viewport | undefined,
) {
  const client = useQueryClient();
  const key = ["findings", runId, viewport];
  return useMutation({
    mutationFn: async (vars: DecisionVars) => {
      const { data, error } = await api.PATCH("/findings/{finding_id}", {
        params: { path: { finding_id: vars.id } },
        body: {
          status: vars.status,
          reason: vars.reason,
          note: vars.note,
        },
      });
      if (error || !data)
        throw new Error("The decision could not be saved. Try again.");
      return data;
    },
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Finding[]>(key);
      client.setQueryData<Finding[]>(key, (old) =>
        old?.map((f) =>
          f.id === vars.id
            ? {
                ...f,
                status: vars.status,
                decision: {
                  status: vars.status,
                  reason: vars.status === "open" ? null : (vars.reason ?? null),
                  note: vars.status === "open" ? null : (vars.note ?? null),
                  decided_at:
                    vars.status === "open" ? null : new Date().toISOString(),
                  decided_by: f.decision?.decided_by ?? null,
                },
              }
            : f,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: (updated) => {
      client.setQueryData<Finding[]>(key, (old) =>
        old?.map((f) => (f.id === updated.id ? updated : f)),
      );
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: ["review"] });
    },
  });
}

export function useRunAgain(
  run: RunSummary,
  onCreated: (runId: string) => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const base = { condition: run.condition, max_focus_steps: 15 };
      const body =
        run.source_kind === "url"
          ? { ...base, url: run.source, viewports: run.viewports }
          : run.source_kind === "folder"
            ? { ...base, folder: run.source }
            : null;
      if (!body) throw new Error("This source cannot be run again");
      const { data, error } = await api.POST("/runs", { body });
      if (error || !data)
        throw new Error("The audit could not be started. Try again.");
      return data.run_id;
    },
    onSuccess: async (id) => {
      await client.invalidateQueries({ queryKey: ["runs"] });
      onCreated(id);
    },
  });
}
