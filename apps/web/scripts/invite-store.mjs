import { createHash, randomBytes } from "node:crypto";

export const DEFAULT_INVITE_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function normaliseInviteEmail(email) {
  return email.trim().toLowerCase();
}

export function generateInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteTtlDays(env = process.env) {
  const parsed = Number(env.INVITE_TTL_DAYS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_INVITE_TTL_DAYS;
}

export function inviteLink(baseUrl, token) {
  return `${baseUrl.replace(/\/+$/, "")}/login?invite=${token}`;
}

export function ensureInvitationSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS invitation (
  email TEXT PRIMARY KEY NOT NULL,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)`);
  const existing = new Set(
    db
      .prepare("PRAGMA table_info(invitation)")
      .all()
      .map((column) => column.name),
  );
  for (const [name, type] of [
    ["token_hash", "TEXT"],
    ["expires_at", "TEXT"],
    ["used_at", "TEXT"],
  ]) {
    if (existing.has(name)) continue;
    try {
      db.exec(`ALTER TABLE invitation ADD COLUMN ${name} ${type}`);
    } catch (error) {
      const columns = db
        .prepare("PRAGMA table_info(invitation)")
        .all()
        .map((column) => column.name);
      if (!columns.includes(name)) throw error;
    }
  }
}

export function issueInvite(
  db,
  { email, invitedBy, ttlDays = DEFAULT_INVITE_TTL_DAYS, now = new Date() },
) {
  const token = generateInviteToken();
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS).toISOString();
  db.prepare(
    `INSERT INTO invitation (email, invited_by, created_at, token_hash, expires_at, used_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(email) DO UPDATE SET
       invited_by = excluded.invited_by,
       created_at = excluded.created_at,
       token_hash = excluded.token_hash,
       expires_at = excluded.expires_at,
       used_at = NULL`,
  ).run(
    normaliseInviteEmail(email),
    invitedBy,
    now.toISOString(),
    hashInviteToken(token),
    expiresAt,
  );
  return { token, expiresAt };
}

export function consumeInvite(db, { email, token, now = new Date() }) {
  if (!token) return false;
  const result = db
    .prepare(
      `UPDATE invitation SET used_at = ?
       WHERE email = ? AND token_hash = ? AND used_at IS NULL
         AND expires_at IS NOT NULL AND expires_at > ?`,
    )
    .run(
      now.toISOString(),
      normaliseInviteEmail(email),
      hashInviteToken(token),
      now.toISOString(),
    );
  return Number(result.changes) === 1;
}

export function hasSocialInvite(db, email, now = new Date()) {
  const row = db
    .prepare("SELECT expires_at AS expiresAt FROM invitation WHERE email = ?")
    .get(normaliseInviteEmail(email));
  if (!row) return false;
  return row.expiresAt === null || row.expiresAt > now.toISOString();
}
