"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Panel, PanelBody } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { INVITE_TOKEN_HEADER, type ProviderId } from "@/lib/auth/policy";
import { GitHubIcon, GoogleIcon } from "./brand-icons";
import {
  describeAuthError,
  describeQueryError,
  MIN_PASSWORD,
  validateCredentials,
} from "./login-model";

type Mode = "signin" | "signup" | "forgot";

type Props = {
  providers: Record<ProviderId, boolean>;
  resetEnabled: boolean;
  next: string;
  error: string;
  invite: string;
};

const PROVIDER_BUTTONS: {
  id: ProviderId;
  label: string;
  Icon: () => React.JSX.Element;
}[] = [
  { id: "google", label: "Continue with Google", Icon: GoogleIcon },
  { id: "github", label: "Continue with GitHub", Icon: GitHubIcon },
];

const TITLES: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create your account",
  forgot: "Reset your password",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="m-0 text-dense text-critical">
      {message}
    </p>
  );
}

export function LoginScreen({
  providers,
  resetEnabled,
  next,
  error,
  invite,
}: Props) {
  const ids = useId();
  const [mode, setMode] = useState<Mode>(invite ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    ReturnType<typeof validateCredentials>
  >({});
  const [status, setStatus] = useState(describeQueryError(error));
  const [failed, setFailed] = useState(Boolean(error));
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const firstMode = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus the email field whenever the form mode changes
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    emailRef.current?.focus();
  }, [mode]);
  const emailRef = useRef<HTMLInputElement>(null);
  const socials = PROVIDER_BUTTONS.filter((b) => providers[b.id]);

  function switchMode(target: Mode) {
    setMode(target);
    setFieldErrors({});
    setStatus("");
    setFailed(false);
    setPassword("");
  }

  function fail(message: string) {
    setStatus(message);
    setFailed(true);
  }

  async function social(provider: ProviderId) {
    setBusy(true);
    setStatus("");
    setFailed(false);
    const { error: socialError } = await authClient.signIn.social({
      provider,
      callbackURL: next,
      errorCallbackURL: `/login?next=${encodeURIComponent(next)}`,
      newUserCallbackURL: next,
    });
    if (socialError) {
      fail(describeAuthError(socialError, "signin"));
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("");
    setFailed(false);
    if (mode === "forgot") {
      const errors = validateCredentials({
        mode: "signin",
        name,
        email,
        password: "x",
      });
      setFieldErrors({ email: errors.email });
      if (errors.email) return;
      setBusy(true);
      await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });
      setBusy(false);
      setStatus(
        "If that email has an account, a reset link is on its way. It expires in one hour.",
      );
      return;
    }
    const errors = validateCredentials({ mode, name, email, password });
    setFieldErrors(errors);
    if (errors.name || errors.email || errors.password) return;
    setBusy(true);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
            fetchOptions: invite
              ? { headers: { [INVITE_TOKEN_HEADER]: invite } }
              : undefined,
          })
        : await authClient.signIn.email({ email: email.trim(), password });
    if (result.error) {
      fail(describeAuthError(result.error, mode));
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  const showFields = mode !== "forgot";

  return (
    <div className="mx-auto w-full max-w-[420px] px-4 py-10 max-[720px]:py-6">
      <Panel>
        <PanelBody className="grid gap-5 p-6 max-[720px]:p-4">
          <div>
            <h1 className="t-page text-ink">{TITLES[mode]}</h1>
            <p className="mt-1 text-ink-2">
              {mode === "signup"
                ? invite
                  ? "Use the email address this invite was sent to."
                  : "Sign-up is by invitation. Use the invite link you were sent."
                : mode === "forgot"
                  ? "Enter your email and we will send a link to choose a new password."
                  : "Use your invited account to open WCAG Auditor."}
            </p>
          </div>

          {mode !== "forgot" && socials.length > 0 ? (
            <>
              <div className="grid gap-2">
                {socials.map(({ id, label, Icon }) => (
                  <Button
                    key={id}
                    type="button"
                    size="lg"
                    className="w-full"
                    disabled={busy || !ready}
                    onClick={() => social(id)}
                  >
                    <Icon />
                    {label}
                  </Button>
                ))}
              </div>
              <div
                aria-hidden="true"
                className="flex items-center gap-3 text-xs text-ink-3"
              >
                <span className="h-px flex-1 bg-line" />
                or use email
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          ) : null}

          <form onSubmit={submit} noValidate className="grid gap-4">
            {mode === "signup" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${ids}-name`}>Name</Label>
                <Input
                  id={`${ids}-name`}
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={
                    fieldErrors.name ? `${ids}-name-err` : undefined
                  }
                />
                <FieldError id={`${ids}-name-err`} message={fieldErrors.name} />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor={`${ids}-email`}>Email</Label>
              <Input
                id={`${ids}-email`}
                ref={emailRef}
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={
                  fieldErrors.email ? `${ids}-email-err` : undefined
                }
              />
              <FieldError id={`${ids}-email-err`} message={fieldErrors.email} />
            </div>
            {showFields ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${ids}-password`}>Password</Label>
                <Input
                  id={`${ids}-password`}
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    [
                      mode === "signup" ? `${ids}-password-hint` : null,
                      fieldErrors.password ? `${ids}-password-err` : null,
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                />
                {mode === "signup" ? (
                  <p
                    id={`${ids}-password-hint`}
                    className="m-0 text-dense text-ink-3"
                  >
                    At least {MIN_PASSWORD} characters.
                  </p>
                ) : null}
                <FieldError
                  id={`${ids}-password-err`}
                  message={fieldErrors.password}
                />
              </div>
            ) : null}

            <output
              aria-live="polite"
              data-testid="auth-status"
              className={
                status
                  ? failed
                    ? "m-0 block rounded-md border border-critical bg-critical-bg px-3 py-2 text-dense text-critical"
                    : "m-0 block rounded-md border border-line bg-subtle px-3 py-2 text-dense text-ink"
                  : "sr-only"
              }
            >
              {status}
            </output>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy || !ready}
            >
              {mode === "signup"
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset link"
                  : "Sign in"}
            </Button>
          </form>

          <div className="grid gap-1 text-dense text-ink-2">
            {mode === "signin" ? (
              <>
                <p className="m-0">
                  Invited but no account yet?{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    disabled={!ready}
                    onClick={() => switchMode("signup")}
                  >
                    Create account
                  </Button>
                </p>
                {resetEnabled ? (
                  <p className="m-0">
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      disabled={!ready}
                      onClick={() => switchMode("forgot")}
                    >
                      Forgot your password?
                    </Button>
                  </p>
                ) : (
                  <p className="m-0 text-ink-3">
                    Forgot your password? Ask an admin to reset your access.
                  </p>
                )}
              </>
            ) : (
              <p className="m-0">
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  disabled={!ready}
                  onClick={() => switchMode("signin")}
                >
                  Back to sign in
                </Button>
              </p>
            )}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
