"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStudyConfig } from "@/hooks/use-study";
import { FormError } from "./step-heading";

export function StudyEntry() {
  const router = useRouter();
  const config = useStudyConfig();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter the participant code the researcher gave you.");
      document.getElementById("study-code")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: e } = await api.POST("/study/sessions", {
      body: { code: trimmed },
    });
    if (e || !data) {
      const detail = (e as { detail?: unknown } | undefined)?.detail;
      setError(
        typeof detail === "string" ? detail : "That code could not be used.",
      );
      setBusy(false);
      document.getElementById("study-code")?.focus();
      return;
    }
    router.push(`/study/${encodeURIComponent(data.code)}`);
  }

  return (
    <div className="mx-auto mt-[12vh] w-full max-w-lg px-6">
      <title>Accessibility report study</title>
      <h1 className="text-h1 font-semibold tracking-tight">
        Accessibility report study
      </h1>
      <p className="mb-6 mt-1 text-body text-muted-foreground">
        Enter the participant code the researcher gave you to begin.
      </p>
      {config.data && !config.data.ethics_approved ? (
        <p className="mb-4 rounded-md border bg-muted px-3 py-2 text-caption">
          Ethics approval is not recorded yet, so only synthetic participant
          codes (SYN01 to SYN16) work.
        </p>
      ) : null}
      <form onSubmit={submit} noValidate>
        <Label htmlFor="study-code">Participant code</Label>
        <Input
          id="study-code"
          value={code}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "study-code-error" : undefined}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          className="mt-1"
        />
        {error ? (
          <p
            id="study-code-error"
            className="mt-1 text-caption text-destructive"
          >
            {error}
          </p>
        ) : null}
        <FormError message={null} />
        <Button type="submit" size="lg" className="mt-4" aria-disabled={busy}>
          Start
        </Button>
      </form>
    </div>
  );
}
