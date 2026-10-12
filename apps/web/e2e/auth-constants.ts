import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const ADMIN = {
  name: "E2E Admin",
  email: "admin@e2e.test",
  password: "e2e-admin-password-1",
};

export const GUEST_PASSWORD = "e2e-guest-password-1";

export const AUTH_STATE = join(
  tmpdir(),
  `wcag-auditor-e2e-auth-${process.env.WEB_PORT ?? 3000}.json`,
);

export const SECOND_ADMIN_EMAIL = "admin2@e2e.test";
export const ADMIN_EMAILS = `${ADMIN.email},${SECOND_ADMIN_EMAIL}`;
export const INVITE_REQUIRED =
  "Use the invite link you were sent to create your account.";

export function inviteToken(link: string): string {
  const token = new URL(link).searchParams.get("invite");
  if (!token) throw new Error(`No invite token in ${link}`);
  return token;
}

export function createInviteViaScript(
  email: string,
  authDb: string,
  baseURL: string,
): string {
  const output = execFileSync(
    process.execPath,
    [resolve(__dirname, "../scripts/create-invite.mjs"), email],
    {
      env: { ...process.env, AUTH_DB_PATH: authDb, BETTER_AUTH_URL: baseURL },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return output.trim();
}

export function expireInvite(authDb: string, email: string) {
  const db = new DatabaseSync(authDb);
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("UPDATE invitation SET expires_at = ? WHERE email = ?").run(
    "2000-01-01T00:00:00.000Z",
    email.toLowerCase(),
  );
  db.close();
}
