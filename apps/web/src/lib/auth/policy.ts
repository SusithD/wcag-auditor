export const NOT_INVITED_MESSAGE =
  "This email has not been invited. Ask the researcher for an invite.";

export const INVITE_REQUIRED_MESSAGE =
  "Use the invite link you were sent to create your account.";
export const PROVIDER_UNVERIFIED_MESSAGE =
  "The provider has not verified that email address. Verify it with the provider and try again.";
export const INVITE_TOKEN_HEADER = "x-invite-token";
export const PASSWORD_SIGN_UP_PATH = "/sign-up/email";

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

export type CreationInput = {
  email: string;
  emailVerified: boolean;
  path: string | null;
  inviteToken: string | null;
};

export type CreationChecks = {
  admins: Set<string>;
  consumeInvite: (email: string, token: string) => boolean;
  hasSocialInvite: (email: string) => boolean;
};

export type CreationDecision =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function authorizeUserCreation(
  input: CreationInput,
  checks: CreationChecks,
): CreationDecision {
  const email = normaliseEmail(input.email);
  if (input.path === null)
    return { ok: false, code: "NOT_INVITED", message: NOT_INVITED_MESSAGE };
  if (input.path === PASSWORD_SIGN_UP_PATH) {
    if (input.inviteToken && checks.consumeInvite(email, input.inviteToken))
      return { ok: true };
    return {
      ok: false,
      code: "INVITE_REQUIRED",
      message: INVITE_REQUIRED_MESSAGE,
    };
  }
  if (!input.emailVerified)
    return {
      ok: false,
      code: "PROVIDER_EMAIL_UNVERIFIED",
      message: PROVIDER_UNVERIFIED_MESSAGE,
    };
  if (checks.admins.has(email) || checks.hasSocialInvite(email))
    return { ok: true };
  return { ok: false, code: "NOT_INVITED", message: NOT_INVITED_MESSAGE };
}

type GithubEmail = { email: string; primary: boolean; verified: boolean };
type GithubProfile = {
  id: number;
  login?: string;
  name?: string | null;
  avatar_url?: string;
};

export async function githubUserInfo(
  accessToken: string,
  fetcher: typeof fetch = fetch,
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "wcag-auditor",
    Accept: "application/vnd.github+json",
  };
  const [profileResponse, emailsResponse] = await Promise.all([
    fetcher("https://api.github.com/user", { headers }),
    fetcher("https://api.github.com/user/emails", { headers }),
  ]);
  if (!profileResponse.ok) return null;
  const profile = (await profileResponse.json()) as GithubProfile;
  const emails = emailsResponse.ok
    ? ((await emailsResponse.json()) as GithubEmail[])
    : [];
  const primary = emails.find((entry) => entry.primary);
  return {
    user: {
      name: profile.name || profile.login || "",
      email: primary?.email,
      image: profile.avatar_url,
      emailVerified: primary?.verified === true,
    },
    data: profile,
  };
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
            getUserInfo: ((token: { accessToken?: string }) =>
              githubUserInfo(token.accessToken ?? "")) as never,
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
