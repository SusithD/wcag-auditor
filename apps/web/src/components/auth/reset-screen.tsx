"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { Panel, PanelBody } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { MIN_PASSWORD } from "./login-model";

export function ResetScreen({ token }: { token: string }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (password.length < MIN_PASSWORD) {
      setFieldError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setFieldError("");
    setBusy(true);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setBusy(false);
    if (error) {
      setMessage(
        "This reset link is invalid or has expired. Request a new one.",
      );
      return;
    }
    setDone(true);
    setMessage("Password updated.");
  }

  return (
    <div className="mx-auto w-full max-w-[420px] px-4 py-10 max-[720px]:py-6">
      <Panel>
        <PanelBody className="grid gap-5 p-6 max-[720px]:p-4">
          <h1 className="t-page text-ink">Choose a new password</h1>
          {!token ? (
            <p className="m-0 text-critical">
              This reset link is incomplete. Request a new one from the sign-in
              page.
            </p>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-pw`}>New password</Label>
                <Input
                  id={`${id}-pw`}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? `${id}-err` : undefined}
                />
                {fieldError ? (
                  <p id={`${id}-err`} className="m-0 text-dense text-critical">
                    {fieldError}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={busy || done || !ready}
              >
                Update password
              </Button>
            </form>
          )}
          <output
            aria-live="polite"
            className="m-0 block text-dense text-ink-2"
          >
            {message}
          </output>
          <a href="/login" className="text-dense">
            Go to sign in
          </a>
        </PanelBody>
      </Panel>
    </div>
  );
}
