export const NOT_INVITED_MESSAGE =
  "This email has not been invited. Ask the researcher for an invite.";

export type Env = Record<string, string | undefined>;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAdminEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map(normaliseEmail)
      .filter((email) => email.length > 0),
  );
}

export function isAdminEmail(
  email: string,
  admins: Set<string> = parseAdminEmails(process.env.ADMIN_EMAILS),
): boolean {
  return admins.has(normaliseEmail(email));
}

export function isInviteAllowed(
  email: string,
  admins: Set<string>,
  isInvited: (normalised: string) => boolean,
): boolean {
  const normalised = normaliseEmail(email);
  return admins.has(normalised) || isInvited(normalised);
}

export type ProviderId = "google" | "github";

export function enabledProviders(env: Env): Record<ProviderId, boolean> {
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  };
}

export function socialProviderConfig(env: Env) {
  const on = enabledProviders(env);
  return {
    ...(on.google
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID as string,
            clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          },
        }
      : {}),
    ...(on.github
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID as string,
            clientSecret: env.GITHUB_CLIENT_SECRET as string,
          },
        }
      : {}),
  };
}

export function resetByEmailEnabled(env: Env): boolean {
  return Boolean(env.SMTP_URL && env.MAIL_FROM);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
