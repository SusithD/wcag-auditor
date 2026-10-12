import type { QueryClient } from "@tanstack/react-query";
import { api, type Condition, type Viewport } from "@/api/client";

export const DEFAULT_FOCUS_STEPS = 15;

export type AuditSource = { url: string } | { upload_id: string };

export type AuditOptions = {
  viewports: Viewport[];
  condition: Condition;
  budget: number;
};

export function uploadFiles(
  files: File[],
  onProgress: (fraction: number) => void,
) {
  return new Promise<{ upload_id: string }>((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { upload_id?: string; detail?: unknown } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.upload_id) {
        resolve({ upload_id: body.upload_id });
      } else {
        reject(
          new Error(
            typeof body.detail === "string"
              ? body.detail
              : "The upload did not finish. Check the files are images and try again.",
          ),
        );
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "The audit service did not answer. Check that it is running, then try again.",
        ),
      );
    xhr.send(form);
  });
}

export async function invalidateRunData(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["runs"] }),
    queryClient.invalidateQueries({ queryKey: ["sites"] }),
    queryClient.invalidateQueries({ queryKey: ["summary"] }),
  ]);
}

export async function startAudit(
  source: AuditSource,
  options: AuditOptions,
  queryClient: QueryClient,
): Promise<string> {
  const { data, error } = await api.POST("/runs", {
    body: {
      ...source,
      viewports: options.viewports,
      condition: options.condition,
      max_focus_steps: options.budget,
    },
  });
  if (error || !data) {
    const detail = (error as { detail?: unknown } | undefined)?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : "The audit could not be started. Try again.",
    );
  }
  await invalidateRunData(queryClient);
  return data.run_id;
}
