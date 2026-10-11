"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/api/client";
import { StatusShape } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BAD_CODE =
  "That code was not found. Check it against the card the researcher gave you, or ask them.";

export function StudyEntry() {
  const router = useRouter();
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
      setError(BAD_CODE);
      setBusy(false);
      document.getElementById("study-code")?.focus();
      return;
    }
    router.push(`/study/${encodeURIComponent(data.code)}`);
  }

  return (
    <div className="mx-auto mt-[12vh] w-full max-w-lg px-6">
      <title>Accessibility report study</title>
      <h1 className="t-page text-ink">Accessibility report study</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">
        Enter the participant code the researcher gave you to begin.
      </p>
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
            className="mt-1 flex items-start gap-2 text-caption text-ink"
          >
            <StatusShape kind="critical" className="mt-0.5" />
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-4"
          aria-disabled={busy}
        >
          Start
        </Button>
      </form>
    </div>
  );
}
