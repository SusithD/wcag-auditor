import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ensureInvitationSchema,
  inviteLink,
  inviteTtlDays,
  issueInvite,
  normaliseInviteEmail,
} from "./invite-store.mjs";

const args = process.argv.slice(2);
const ttlFlag = args.find((arg) => arg.startsWith("--ttl-days="));
const email = normaliseInviteEmail(
  args.find((arg) => !arg.startsWith("--")) ?? "",
);

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node scripts/create-invite.mjs <email> [--ttl-days=N]");
  process.exit(2);
}

const ttlDays = ttlFlag ? Number(ttlFlag.split("=")[1]) : inviteTtlDays();
if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
  console.error("--ttl-days must be a positive number");
  process.exit(2);
}

const dbPath =
  process.env.AUTH_DB_PATH ??
  (process.env.NODE_ENV === "production" ? "/data/auth.db" : "./data/auth.db");
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");
ensureInvitationSchema(db);
const { token, expiresAt } = issueInvite(db, {
  email,
  invitedBy: "cli",
  ttlDays,
});
db.close();

const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
console.error(`Invite for ${email} expires ${expiresAt}. Single use.`);
console.log(inviteLink(base, token));
