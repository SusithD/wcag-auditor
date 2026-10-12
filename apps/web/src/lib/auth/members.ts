import { inviteTtlDays, issueInvite } from "../../../scripts/invite-store.mjs";
import { getAuthDb } from "./auth";
import { isAdminEmail, normaliseEmail } from "./policy";

export type Member = {
  id: string;
  name: string;
  email: string;
  provider: string;
  lastSignIn: string | null;
  isAdmin: boolean;
};

export type InvitationStatus = "pending" | "used" | "expired" | "legacy";

export type Invitation = {
  email: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string | null;
  status: InvitationStatus;
};

type InvitationRow = {
  email: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  tokenHash: string | null;
};

function invitationStatus(row: InvitationRow, now: Date): InvitationStatus {
  if (row.usedAt) return "used";
  if (!row.tokenHash || !row.expiresAt) return "legacy";
  return row.expiresAt > now.toISOString() ? "pending" : "expired";
}

type UserRow = {
  id: string;
  name: string;
  email: string;
  providers: string | null;
  lastSignIn: string | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  credential: "Email",
  google: "Google",
  github: "GitHub",
};

function providerLabel(ids: string | null): string {
  if (!ids) return "Email";
  return ids
    .split(",")
    .map((id) => PROVIDER_LABELS[id] ?? id)
    .join(", ");
}

export async function listMembers(): Promise<{
  users: Member[];
  invitations: Invitation[];
}> {
  const db = await getAuthDb();
  const users = db
    .prepare(
      `SELECT u.id AS id, u.name AS name, u.email AS email,
        (SELECT group_concat(DISTINCT a.providerId) FROM account a WHERE a.userId = u.id) AS providers,
        (SELECT max(s.createdAt) FROM session s WHERE s.userId = u.id) AS lastSignIn
       FROM user u ORDER BY u.createdAt ASC`,
    )
    .all() as UserRow[];
  const now = new Date();
  const invitations = (
    db
      .prepare(
        `SELECT email, invited_by AS invitedBy, created_at AS createdAt,
          expires_at AS expiresAt, used_at AS usedAt, token_hash AS tokenHash
         FROM invitation ORDER BY created_at DESC`,
      )
      .all() as InvitationRow[]
  ).map(
    (row): Invitation => ({
      email: row.email,
      invitedBy: row.invitedBy,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      status: invitationStatus(row, now),
    }),
  );
  return {
    users: users.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      provider: providerLabel(row.providers),
      lastSignIn: row.lastSignIn,
      isAdmin: isAdminEmail(row.email),
    })),
    invitations,
  };
}

export async function addInvitation(
  email: string,
  invitedBy: string,
): Promise<{ token: string; expiresAt: string }> {
  const db = await getAuthDb();
  return issueInvite(db, {
    email: normaliseEmail(email),
    invitedBy,
    ttlDays: inviteTtlDays(),
  });
}

export async function revokeInvitation(email: string): Promise<boolean> {
  const db = await getAuthDb();
  const result = db
    .prepare("DELETE FROM invitation WHERE email = ?")
    .run(normaliseEmail(email));
  return Number(result.changes) > 0;
}

export type RemoveResult = "removed" | "missing" | "admin" | "self";

export async function removeUser(
  id: string,
  actingUserId: string,
): Promise<RemoveResult> {
  const db = await getAuthDb();
  const row = db.prepare("SELECT email FROM user WHERE id = ?").get(id) as
    | { email: string }
    | undefined;
  if (!row) return "missing";
  if (id === actingUserId) return "self";
  if (isAdminEmail(row.email)) return "admin";
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM session WHERE userId = ?").run(id);
    db.prepare("DELETE FROM account WHERE userId = ?").run(id);
    db.prepare("DELETE FROM user WHERE id = ?").run(id);
    db.prepare("DELETE FROM invitation WHERE email = ?").run(
      normaliseEmail(row.email),
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return "removed";
}
