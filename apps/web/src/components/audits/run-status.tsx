import { type ShapeKind, Status } from "@/components/ds";

const STATUS: Record<string, { kind: ShapeKind; word: string }> = {
  queued: { kind: "running", word: "Queued" },
  running: { kind: "running", word: "Running" },
  done: { kind: "done", word: "Complete" },
  partial: { kind: "alert", word: "Partly complete" },
  failed: { kind: "failed", word: "Audit failed" },
  cancelled: { kind: "undecided", word: "Cancelled" },
};

export function statusWord(status: string): string {
  return STATUS[status]?.word ?? status;
}

export function RunStatus({ status }: { status: string }) {
  const entry = STATUS[status] ?? { kind: "undecided", word: status };
  return <Status kind={entry.kind}>{entry.word}</Status>;
}

export function siteInitial(site: string): string {
  return (site[0] ?? "?").toUpperCase();
}
