"use client";

import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { type Materials, useStudyAction } from "@/hooks/use-study";
import { FormError, StepHeading } from "./step-heading";

const SCALE = [
  "Strongly disagree",
  "Disagree",
  "Neither",
  "Agree",
  "Strongly agree",
];

export function SusStep({
  code,
  block,
  materials,
}: {
  code: string;
  block: number;
  materials: Materials;
}) {
  const [scores, setScores] = useState<(number | null)[]>(
    materials.sus_items.map(() => null),
  );
  const [error, setError] = useState<string | null>(null);
  const action = useStudyAction(code, (body: number[]) =>
    api.POST("/study/sessions/{code}/sus/{block}", {
      params: { path: { code, block } },
      body: { scores: body },
    }),
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const missing = scores.indexOf(null);
    if (missing >= 0) {
      setError(`Answer statement ${missing + 1} before you continue.`);
      document
        .querySelector<HTMLInputElement>(`input[name="sus-${missing}"]`)
        ?.focus();
      return;
    }
    setError(null);
    action.mutate(scores as number[], { onError: (e) => setError(e.message) });
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepHeading hint="About the report you just used. 1 means strongly disagree, 5 means strongly agree.">
        Questionnaire {block} of 2
      </StepHeading>
      <div className="space-y-5">
        {materials.sus_items.map((text, i) => (
          <fieldset key={text}>
            <legend className="mb-1 text-body font-medium">
              {i + 1}. {text}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {SCALE.map((label, k) => (
                <label
                  key={label}
                  className="inline-flex min-h-6 items-center gap-1.5 text-body"
                >
                  <input
                    type="radio"
                    name={`sus-${i}`}
                    value={k + 1}
                    className="size-4"
                    checked={scores[i] === k + 1}
                    onChange={() =>
                      setScores(scores.map((s, j) => (j === i ? k + 1 : s)))
                    }
                  />
                  <span>
                    {k + 1}{" "}
                    <span className="text-muted-foreground">{label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <FormError message={error} />
      <Button type="submit" className="mt-6" size="lg">
        Continue
      </Button>
    </form>
  );
}
