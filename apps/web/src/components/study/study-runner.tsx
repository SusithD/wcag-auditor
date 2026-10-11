"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useMaterials, useSession } from "@/hooks/use-study";
import {
  BreakStep,
  ConsentStep,
  DebriefStep,
  DemographicsStep,
  DoneStep,
} from "./steps";
import { SusStep } from "./sus-step";
import { TaskStep } from "./task-step";

function stepTitle(step: {
  kind: string;
  task_index?: number | null;
  block?: number | null;
  position_in_block?: number | null;
}) {
  if (step.kind === "task")
    return `Task ${step.position_in_block ?? step.task_index} of 4`;
  if (step.kind === "sus") return `Questionnaire ${step.block} of 2`;
  return (
    {
      consent: "Before we start",
      demographics: "About you",
      break: "Break",
      debrief: "Debrief",
      done: "Thank you",
    }[step.kind] ?? "Study"
  );
}

export function StudyRunner({ code }: { code: string }) {
  const session = useSession(code);
  const materials = useMaterials();

  if (session.isError) {
    return (
      <div className="mx-auto max-w-160 px-6 py-12">
        <title>Participant code not found - study</title>
        <h1 className="text-h2 font-semibold">
          That participant code was not found
        </h1>
        <p className="mt-2 text-body text-muted-foreground">
          That code was not found. Check it against the card the researcher gave
          you, or ask them.
        </p>
      </div>
    );
  }
  if (!session.data || !materials.data) {
    return (
      <div className="p-6" aria-busy="true">
        <title>Loading - study</title>
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }
  const state = session.data;
  const step = state.next;
  const wide = step.kind === "task";

  return (
    <div
      className={`mx-auto w-full px-6 py-8 ${wide ? "max-w-[1700px]" : "max-w-3xl"}`}
    >
      <title>{`${stepTitle(step)} - study`}</title>
      {state.synthetic ? (
        <p
          role="note"
          className="mb-4 rounded-md border bg-muted px-3 py-2 text-caption"
        >
          Synthetic session: no real participant data is collected.
        </p>
      ) : null}
      {step.kind === "consent" ? (
        <ConsentStep code={code} materials={materials.data} />
      ) : null}
      {step.kind === "demographics" ? (
        <DemographicsStep code={code} materials={materials.data} />
      ) : null}
      {step.kind === "task" && step.task_index ? (
        <TaskStep key={step.task_index} code={code} index={step.task_index} />
      ) : null}
      {step.kind === "sus" && step.block ? (
        <SusStep
          key={step.block}
          code={code}
          block={step.block}
          materials={materials.data}
        />
      ) : null}
      {step.kind === "break" ? <BreakStep code={code} /> : null}
      {step.kind === "debrief" ? (
        <DebriefStep code={code} materials={materials.data} />
      ) : null}
      {step.kind === "done" ? (
        <DoneStep materials={materials.data} state={state} />
      ) : null}
    </div>
  );
}
