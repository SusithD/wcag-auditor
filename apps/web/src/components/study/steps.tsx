"use client";

import { useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  type Materials,
  type SessionState,
  useStudyAction,
} from "@/hooks/use-study";
import { FormError, StepHeading } from "./step-heading";

export function ConsentStep({
  code,
  materials,
}: {
  code: string;
  materials: Materials;
}) {
  const [required, setRequired] = useState<boolean[]>(
    materials.consent_statements.map(() => false),
  );
  const [optional, setOptional] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const action = useStudyAction(
    code,
    (body: { statements: boolean[]; optional: Record<string, boolean> }) =>
      api.POST("/study/sessions/{code}/consent", {
        params: { path: { code } },
        body,
      }),
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!required.every(Boolean)) {
      setError(
        "Tick every required statement to take part. You can stop at any time.",
      );
      first.current?.focus();
      return;
    }
    setError(null);
    action.mutate(
      { statements: required, optional },
      { onError: (e) => setError(e.message) },
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepHeading hint="Written consent was given before this session. Please confirm each statement.">
        Before we start
      </StepHeading>
      <section aria-labelledby="opening-h" className="mb-6 space-y-2 text-body">
        <h2 id="opening-h" className="text-h3 font-semibold">
          About this session
        </h2>
        {materials.opening.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </section>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-h3 font-semibold">Required</legend>
        {materials.consent_statements.map((text, i) => (
          <Label key={text} className="min-h-6 items-start gap-2">
            <input
              ref={i === 0 ? first : undefined}
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              checked={required[i]}
              onChange={(e) =>
                setRequired(
                  required.map((v, j) => (j === i ? e.target.checked : v)),
                )
              }
            />
            <span>{text}</span>
          </Label>
        ))}
      </fieldset>
      <fieldset className="mt-6 space-y-2">
        <legend className="mb-2 text-h3 font-semibold">Optional</legend>
        {Object.entries(materials.optional_consents).map(([key, text]) => (
          <Label key={key} className="min-h-6 items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              checked={optional[key] ?? false}
              onChange={(e) =>
                setOptional({ ...optional, [key]: e.target.checked })
              }
            />
            <span>{text}</span>
          </Label>
        ))}
      </fieldset>
      <FormError message={error} />
      <Button type="submit" className="mt-6" size="lg">
        Continue
      </Button>
    </form>
  );
}

const LABELS: Record<string, string> = {
  age_band: "Age band",
  years_experience: "Years of web development experience",
  role_type: "Role",
  accessibility_exposure: "Prior accessibility exposure",
  wcag_familiarity: "Familiarity with WCAG",
};

export function DemographicsStep({
  code,
  materials,
}: {
  code: string;
  materials: Materials;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const action = useStudyAction(code, (body: Record<string, string>) =>
    api.POST("/study/sessions/{code}/demographics", {
      params: { path: { code } },
      body: { answers: body },
    }),
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const missing = Object.keys(materials.demographics).find(
      (k) => !answers[k],
    );
    if (missing) {
      setError(`Choose an answer for "${LABELS[missing] ?? missing}".`);
      document.getElementById(`demo-${missing}`)?.focus();
      return;
    }
    setError(null);
    action.mutate(answers, { onError: (e) => setError(e.message) });
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepHeading hint="Non-identifying background questions.">
        About you
      </StepHeading>
      <div className="space-y-4">
        {Object.entries(materials.demographics).map(([key, options]) => (
          <div key={key}>
            <Label htmlFor={`demo-${key}`}>{LABELS[key] ?? key}</Label>
            <select
              id={`demo-${key}`}
              value={answers[key] ?? ""}
              onChange={(e) =>
                setAnswers({ ...answers, [key]: e.target.value })
              }
              className="mt-1 block min-h-8 w-full max-w-sm rounded-md border border-input bg-background px-2 text-body"
            >
              <option value="">Choose</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <FormError message={error} />
      <Button type="submit" className="mt-6" size="lg">
        Continue
      </Button>
    </form>
  );
}

export function BreakStep({ code }: { code: string }) {
  const action = useStudyAction(code, () =>
    api.POST("/study/sessions/{code}/break", { params: { path: { code } } }),
  );
  return (
    <div>
      <StepHeading hint="The first block is finished.">Break</StepHeading>
      <p className="max-w-prose text-body">
        You can take a break of up to five minutes. If you are being recorded,
        the researcher will pause the recording during the break. When you are
        ready, start the second block with the other report.
      </p>
      <Button
        className="mt-6"
        size="lg"
        onClick={() => action.mutate(undefined)}
      >
        Start the second block
      </Button>
      <FormError message={action.error?.message ?? null} />
    </div>
  );
}

export function DebriefStep({
  code,
  materials,
}: {
  code: string;
  materials: Materials;
}) {
  const [answers, setAnswers] = useState(
    materials.debrief_questions.map(() => ""),
  );
  const [error, setError] = useState<string | null>(null);
  const action = useStudyAction(code, (body: string[]) =>
    api.POST("/study/sessions/{code}/debrief", {
      params: { path: { code } },
      body: { answers: body },
    }),
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate(answers, { onError: (err) => setError(err.message) });
      }}
    >
      <StepHeading hint="A few short open questions. Answer as much or as little as you like.">
        Debrief
      </StepHeading>
      <div className="space-y-4">
        {materials.debrief_questions.map((q, i) => (
          <div key={q}>
            <Label htmlFor={`debrief-${i}`}>{q}</Label>
            <textarea
              id={`debrief-${i}`}
              rows={3}
              value={answers[i]}
              onChange={(e) =>
                setAnswers(
                  answers.map((a, j) => (j === i ? e.target.value : a)),
                )
              }
              className="mt-1 block w-full rounded-md border border-input bg-background p-2 text-body"
            />
          </div>
        ))}
      </div>
      <FormError message={error} />
      <Button type="submit" className="mt-6" size="lg">
        Finish
      </Button>
    </form>
  );
}

export function DoneStep({
  materials,
  state,
}: {
  materials: Materials;
  state: SessionState;
}) {
  return (
    <div>
      <StepHeading>Thank you</StepHeading>
      <div className="max-w-prose space-y-3 text-body">
        {materials.closing.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {state.synthetic ? (
          <p className="text-muted-foreground">
            This was a synthetic session: no real participant data was
            collected.
          </p>
        ) : null}
      </div>
    </div>
  );
}
