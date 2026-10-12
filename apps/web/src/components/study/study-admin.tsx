"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { components } from "@/api/types";
import { PageHeader, Panel, PanelBody, StatusShape } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStudyConfig } from "@/hooks/use-study";

type AdminTask = components["schemas"]["AdminTask"];
const KEY = "study-admin-token";

function headers(token: string) {
  return { "X-Study-Token": token, "Content-Type": "application/json" };
}

export function StudyAdmin() {
  const client = useQueryClient();
  const config = useStudyConfig();
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(KEY) ?? "";
      setToken(t);
      setSaved(t);
    } catch {
      setSaved("");
    }
  }, []);

  const tasks = useQuery({
    enabled: saved !== "",
    queryKey: ["study", "admin", saved],
    retry: false,
    queryFn: async (): Promise<AdminTask[]> => {
      const res = await fetch("/api/study/admin/tasks", {
        headers: headers(saved),
      });
      if (!res.ok)
        throw new Error(
          res.status === 403
            ? "Wrong token, or administration is disabled"
            : "Could not load",
        );
      return res.json();
    },
  });

  useEffect(() => {
    if (tasks.isSuccess) setToken("");
  }, [tasks.isSuccess]);

  async function prepare() {
    const res = await fetch("/api/study/prepare", {
      method: "POST",
      headers: headers(saved),
    });
    setMessage(
      res.ok
        ? "Study pages queued; the count below updates as audits finish."
        : "Preparing failed",
    );
    client.invalidateQueries({ queryKey: ["study", "config"] });
  }

  async function rate(task: AdminTask, success: boolean | null, notes: string) {
    const res = await fetch(`/api/study/admin/tasks/${task.id}`, {
      method: "PATCH",
      headers: headers(saved),
      body: JSON.stringify({ success, notes }),
    });
    setMessage(
      res.ok
        ? `Saved ${task.participant_code} ${task.task_id}`
        : "Saving failed",
    );
    client.invalidateQueries({ queryKey: ["study", "admin", saved] });
  }

  async function download(kind: string) {
    const res = await fetch(`/api/study/admin/export/${kind}.csv`, {
      headers: headers(saved),
    });
    if (!res.ok) {
      setMessage("Export failed");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `study-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <title>Study administration</title>
      <PageHeader
        title="Study administration"
        description={
          <>
            Researcher view: prepare the task pages, rate fixes against the
            rubric and export the data.
            {config.data && !config.data.ethics_approved
              ? " Ethics approval is not recorded: only synthetic participants are enabled."
              : ""}
          </>
        }
      />
      <Panel className="max-w-md">
        <PanelBody>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                sessionStorage.setItem(KEY, token);
              } catch {
                /* storage unavailable */
              }
              setSaved(token);
            }}
          >
            <div className="flex-1">
              <Label htmlFor="admin-token">Administration token</Label>
              <Input
                id="admin-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                className="mt-1"
              />
            </div>
            <Button type="submit">Unlock</Button>
          </form>
        </PanelBody>
      </Panel>
      {tasks.isError ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 text-body text-ink"
        >
          <StatusShape kind="critical" className="mt-1" />
          {tasks.error.message}
        </p>
      ) : null}
      <p role="status" className="mt-2 text-body">
        {message ??
          (tasks.isSuccess
            ? `Loaded ${tasks.data.length} ${tasks.data.length === 1 ? "task" : "tasks"}`
            : "")}
      </p>
      {saved && !tasks.isError ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={prepare}>
              Prepare study pages
            </Button>
            <span className="text-body">
              {config.data
                ? `${config.data.prepared} of ${config.data.total_runs} study pages ready`
                : ""}
            </span>
            {["tasks", "sus", "sessions"].map((kind) => (
              <Button
                key={kind}
                variant="outline"
                onClick={() => download(kind)}
              >
                Export {kind} CSV
              </Button>
            ))}
          </div>
          <div
            role="region"
            aria-label="Task ratings"
            tabIndex={0}
            className="mt-4 overflow-x-auto"
          >
            <table className="w-full border-collapse text-row">
              <caption className="sr-only">
                Submitted fixes with the scoring rubric
              </caption>
              <thead>
                <tr>
                  {[
                    "Participant",
                    "Task",
                    "Condition",
                    "Seconds",
                    "Fix",
                    "Rubric",
                    "Success",
                    "Notes",
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="border-b px-3 py-2 text-left font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(tasks.data ?? []).map((t) => (
                  <RatingRow
                    key={`${t.participant_code}-${t.task_id}`}
                    task={t}
                    onRate={rate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

function RatingRow({
  task,
  onRate,
}: {
  task: AdminTask;
  onRate: (t: AdminTask, success: boolean | null, notes: string) => void;
}) {
  const [notes, setNotes] = useState(task.notes ?? "");
  const value = task.success === null ? "" : task.success ? "yes" : "no";
  return (
    <tr className="align-top">
      <th scope="row" className="border-b px-3 py-2 text-left font-normal">
        {task.participant_code}
      </th>
      <td className="border-b px-3 py-2 font-mono text-label">
        {task.task_id} ({task.sc})
      </td>
      <td className="border-b px-3 py-2">{task.condition}</td>
      <td className="border-b px-3 py-2 font-mono text-label">
        {task.seconds?.toFixed(1) ?? "-"}
      </td>
      <td className="max-w-xs border-b px-3 py-2">{task.fix_text ?? "-"}</td>
      <td className="max-w-xs border-b px-3 py-2 text-caption">
        <strong>Issue:</strong> {String(task.rubric.issue)}
        <br />
        <strong>Expected:</strong> {String(task.rubric.expected_fix)}
        <br />
        <strong>Success:</strong> {String(task.rubric.success_criteria)}
      </td>
      <td className="border-b px-3 py-2">
        <label className="sr-only" htmlFor={`rate-${task.id}`}>
          Success for {task.participant_code} {task.task_id}
        </label>
        <select
          id={`rate-${task.id}`}
          value={value}
          onChange={(e) =>
            onRate(
              task,
              e.target.value === "" ? null : e.target.value === "yes",
              notes,
            )
          }
          className="min-h-8 rounded-md border border-line-strong bg-surface px-2 text-body"
        >
          <option value="">Not rated</option>
          <option value="yes">Success</option>
          <option value="no">Not successful</option>
        </select>
      </td>
      <td className="border-b px-3 py-2">
        <label className="sr-only" htmlFor={`notes-${task.id}`}>
          Notes for {task.participant_code} {task.task_id}
        </label>
        <Input
          id={`notes-${task.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() =>
            notes !== (task.notes ?? "") && onRate(task, task.success, notes)
          }
        />
      </td>
    </tr>
  );
}
