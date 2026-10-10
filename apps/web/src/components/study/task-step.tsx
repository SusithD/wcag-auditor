"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { ReportScreen } from "@/components/report/report-screen";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { type TaskView, useStudyAction } from "@/hooks/use-study";
import { FormError } from "./step-heading";

export function TaskStep({ code, index }: { code: string; index: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const heading = useRef<HTMLHeadingElement>(null);
  const [fix, setFix] = useState("");
  const [error, setError] = useState<string | null>(null);
  const view = useQuery({
    queryKey: ["study", "task", code, index],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<TaskView> => {
      const { data, error: e } = await api.POST(
        "/study/sessions/{code}/tasks/{index}/open",
        {
          params: { path: { code, index } },
        },
      );
      if (e || !data) throw new Error("The task could not be opened");
      return data;
    },
  });
  const run = useQuery({
    enabled: !!view.data,
    queryKey: ["study", "run", view.data?.run_id],
    queryFn: async () => {
      const { data, error: e } = await api.GET("/runs/{run_id}", {
        params: { path: { run_id: view.data?.run_id as string } },
      });
      if (e || !data) throw new Error("The report could not be loaded");
      return data;
    },
  });
  const submit = useStudyAction(code, (body: string) =>
    api.POST("/study/sessions/{code}/tasks/{index}/submit", {
      params: { path: { code, index } },
      body: { fix_text: body },
    }),
  );

  useEffect(() => {
    if (view.data) heading.current?.focus();
  }, [view.data]);

  if (view.isError) {
    return (
      <FormError message="This task could not be opened. Ask the researcher for help." />
    );
  }
  if (!view.data) {
    return (
      <div aria-busy="true">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const t = view.data;

  function done(event: React.FormEvent) {
    event.preventDefault();
    if (submit.isPending) return;
    if (!fix.trim()) {
      setError("Write or describe your proposed fix before you finish.");
      document.getElementById("fix-text")?.focus();
      return;
    }
    setError(null);
    submit.mutate(fix, {
      onSuccess: () => router.replace(pathname),
      onError: (e) => setError(e.message),
    });
  }

  return (
    <div>
      <header className="mb-3">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-h2 font-semibold outline-none"
        >
          Task {t.position_in_block} of {t.block_size}
        </h1>
        <p className="text-body text-muted-foreground">{t.brief}</p>
      </header>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 overflow-hidden rounded-lg border">
          {run.data ? (
            <ReportScreen
              run={run.data}
              headingRef={{ current: null }}
              embedded
              className="h-[72dvh]"
            />
          ) : run.isError ? (
            <p role="alert" className="p-4 text-body">
              The report could not be loaded. Ask the researcher for help.
            </p>
          ) : (
            <div className="p-4" aria-busy="true">
              <Skeleton className="h-96 w-full" />
            </div>
          )}
        </div>
        <form
          onSubmit={done}
          noValidate
          className="flex flex-col gap-2"
          aria-label="Your proposed fix"
        >
          <Label htmlFor="fix-text">Your proposed fix</Label>
          <p id="fix-help" className="text-caption text-muted-foreground">
            Write the code, or describe in words what you would change. Select
            Done when you have finished.
          </p>
          <textarea
            id="fix-text"
            aria-describedby={error ? "fix-help fix-error" : "fix-help"}
            aria-invalid={error ? true : undefined}
            rows={10}
            value={fix}
            onChange={(e) => setFix(e.target.value)}
            className="block w-full rounded-md border border-input bg-background p-2 font-mono text-body"
          />
          <FormError message={error} id="fix-error" />
          <Button
            type="submit"
            size="lg"
            aria-disabled={submit.isPending}
            className="aria-disabled:opacity-60"
          >
            Done
          </Button>
          <output aria-live="polite" className="sr-only">
            {submit.isPending ? "Saving your fix" : ""}
          </output>
        </form>
      </div>
    </div>
  );
}
