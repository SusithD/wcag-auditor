import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import {
  isInviteAllowed,
  NOT_INVITED_MESSAGE,
  normaliseEmail,
  parseAdminEmails,
  resetByEmailEnabled,
  socialProviderConfig,
} from "./policy";

const INVITATION_DDL = `CREATE TABLE IF NOT EXISTS invitation (
  email TEXT PRIMARY KEY NOT NULL,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)`;

export function authDbPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.AUTH_DB_PATH) return env.AUTH_DB_PATH;
  return env.NODE_ENV === "production" ? "/data/auth.db" : "./data/auth.db";
}

function openDatabase(): DatabaseSync {
  const path = authDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

async function sendResetEmail(to: string, url: string) {
  const { createTransport } = await import("nodemailer");
  const transport = createTransport(process.env.SMTP_URL as string);
  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Reset your WCAG Auditor password",
    text: `Use this link to choose a new password. It expires in one hour.\n\n${url}\n`,
  });
}

function build(db: DatabaseSync) {
  const admins = parseAdminEmails(process.env.ADMIN_EMAILS);
  const isInvited = (email: string) =>
    db.prepare("SELECT 1 FROM invitation WHERE email = ?").get(email) !==
    undefined;
  return betterAuth({
    database: db,
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    telemetry: { enabled: false },
    rateLimit: { enabled: process.env.AUTH_RATE_LIMIT !== "0" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
      ...(resetByEmailEnabled(process.env)
        ? {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => {
              await sendResetEmail(user.email, url);
            },
          }
        : {}),
    },
    socialProviders: socialProviderConfig(process.env),
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isInviteAllowed(user.email, admins, isInvited)) {
              throw new APIError("FORBIDDEN", {
                message: NOT_INVITED_MESSAGE,
                code: "NOT_INVITED",
              });
            }
            return { data: { ...user, email: normaliseEmail(user.email) } };
          },
        },
      },
    },
  });
}

type AuthInstance = ReturnType<typeof build>;
type Ready = { auth: AuthInstance; db: DatabaseSync };

const globalForAuth = globalThis as { __wcagAuth?: Promise<Ready> };

async function init(): Promise<Ready> {
  const db = openDatabase();
  const auth = build(db);
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  db.exec(INVITATION_DDL);
  return { auth, db };
}

function ready(): Promise<Ready> {
  if (!globalForAuth.__wcagAuth) {
    globalForAuth.__wcagAuth = init().catch((error) => {
      globalForAuth.__wcagAuth = undefined;
      throw error;
    });
  }
  return globalForAuth.__wcagAuth;
}

export async function getAuth(): Promise<AuthInstance> {
  return (await ready()).auth;
}

export async function getAuthDb(): Promise<DatabaseSync> {
  return (await ready()).db;
}
