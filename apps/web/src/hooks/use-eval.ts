"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/api/client";
import type { EvalSummary } from "@/lib/eval";

export function useEvalList() {
  return useQuery({
    queryKey: ["evals"],
    queryFn: async (): Promise<EvalSummary[]> => {
      const { data, error } = await api.GET("/eval");
      if (error || !data)
        throw new Error("The evaluations could not be listed");
      return data;
    },
  });
}

export function useEvalDetail(id: number | undefined) {
  return useQuery({
    enabled: id !== undefined,
    queryKey: ["eval", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/eval/{eval_id}", {
        params: { path: { eval_id: id as number } },
      });
      if (error || !data) throw new Error("The evaluation could not be loaded");
      return data;
    },
  });
}

export function useStartEval() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (conditions: ("rule_only" | "pixel" | "hybrid")[]) => {
      const { data, error } = await api.POST("/eval", {
        body: { conditions, include_needs_review: false, bootstrap: 10000 },
      });
      if (error || !data) {
        const detail = (error as { detail?: unknown } | undefined)?.detail;
        throw new Error(
          typeof detail === "string"
            ? detail
            : "The evaluation could not be started",
        );
      }
      return data.eval_id;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["evals"] }),
  });
}

export function useEvalProgress(id: number | undefined, active: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    if (id === undefined || !active) return;
    const source = new EventSource(`/api/eval/${id}/events`);
    source.addEventListener("progress", (message) => {
      const summary = JSON.parse(
        (message as MessageEvent<string>).data,
      ) as EvalSummary;
      client.setQueryData<EvalSummary[]>(["evals"], (old) =>
        old?.map((e) => (e.id === summary.id ? summary : e)),
      );
      if (summary.status === "done" || summary.status === "failed") {
        source.close();
        client.invalidateQueries({ queryKey: ["eval", id] });
        client.invalidateQueries({ queryKey: ["evals"] });
      }
    });
    return () => source.close();
  }, [id, active, client]);
}
