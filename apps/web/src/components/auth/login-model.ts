import {
  INVITE_REQUIRED_MESSAGE,
  NOT_INVITED_MESSAGE,
  PROVIDER_UNVERIFIED_MESSAGE,
} from "@/lib/auth/policy";

export const MIN_PASSWORD = 10;

type AuthError = { code?: string; message?: string } | null | undefined;

export function describeAuthError(
  error: AuthError,
  mode: "signin" | "signup",
): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "INVITE_REQUIRED" || /invite link/i.test(message))
    return INVITE_REQUIRED_MESSAGE;
  if (code === "PROVIDER_EMAIL_UNVERIFIED") return PROVIDER_UNVERIFIED_MESSAGE;
  if (code === "NOT_INVITED" || /not been invited/i.test(message))
    return NOT_INVITED_MESSAGE;
  if (code === "INVALID_EMAIL_OR_PASSWORD")
    return "That email and password do not match. Check them and try again.";
  if (code === "USER_ALREADY_EXISTS" || /already exists/i.test(message))
    return "An account with this email already exists. Sign in instead.";
  if (code === "PASSWORD_TOO_SHORT")
    return `Use at least ${MIN_PASSWORD} characters for the password.`;
  if (/rate|too many/i.test(code + message))
    return "Too many attempts. Wait a minute and try again.";
  return mode === "signin"
    ? "Could not sign you in. Try again."
    : "Could not create the account. Try again.";
}

export function describeQueryError(value: string | null | undefined): string {
  if (!value) return "";
  if (value === "INVITE_REQUIRED") return INVITE_REQUIRED_MESSAGE;
  if (value === "PROVIDER_EMAIL_UNVERIFIED") return PROVIDER_UNVERIFIED_MESSAGE;
  if (/invit/i.test(value) || value === "NOT_INVITED")
    return NOT_INVITED_MESSAGE;
  if (value === "account_not_linked")
    return "That email already has an account that this provider cannot sign in to. Use your password.";
  return "Could not sign you in with that provider. Try again.";
}

export function validateCredentials(input: {
  mode: "signin" | "signup";
  name: string;
  email: string;
  password: string;
}): { name?: string; email?: string; password?: string } {
  const errors: { name?: string; email?: string; password?: string } = {};
  if (input.mode === "signup" && !input.name.trim())
    errors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))
    errors.email = "Enter a valid email address.";
  if (!input.password) errors.password = "Enter your password.";
  else if (input.mode === "signup" && input.password.length < MIN_PASSWORD)
    errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  return errors;
}
