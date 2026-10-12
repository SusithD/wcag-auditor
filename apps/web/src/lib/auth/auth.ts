import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import {
  consumeInvite,
  ensureInvitationSchema,
  hasSocialInvite,
} from "../../../scripts/invite-store.mjs";
import {
  authorizeUserCreation,
  INVITE_TOKEN_HEADER,
  normaliseEmail,
  parseAdminEmails,
  resetByEmailEnabled,
  socialProviderConfig,
} from "./policy";

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
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        requireLocalEmailVerified: true,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const decision = authorizeUserCreation(
              {
                email: user.email,
                emailVerified: user.emailVerified === true,
                path: context?.path ?? null,
                inviteToken:
                  context?.headers?.get(INVITE_TOKEN_HEADER) ??
                  context?.request?.headers.get(INVITE_TOKEN_HEADER) ??
                  null,
              },
              {
                admins,
                consumeInvite: (email, token) =>
                  consumeInvite(db, { email, token }),
                hasSocialInvite: (email) => hasSocialInvite(db, email),
              },
            );
            if (!decision.ok)
              throw new APIError("FORBIDDEN", {
                message: decision.message,
                code: decision.code,
              });
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
  ensureInvitationSchema(db);
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
