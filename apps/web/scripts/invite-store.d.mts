import type { DatabaseSync } from "node:sqlite";

export const DEFAULT_INVITE_TTL_DAYS: number;
export function normaliseInviteEmail(email: string): string;
export function generateInviteToken(): string;
export function hashInviteToken(token: string): string;
export function inviteTtlDays(env?: Record<string, string | undefined>): number;
export function inviteLink(baseUrl: string, token: string): string;
export function ensureInvitationSchema(db: DatabaseSync): void;
export function issueInvite(
  db: DatabaseSync,
  input: { email: string; invitedBy: string; ttlDays?: number; now?: Date },
): { token: string; expiresAt: string };
export function consumeInvite(
  db: DatabaseSync,
  input: { email: string; token: string | null | undefined; now?: Date },
): boolean;
export function hasSocialInvite(
  db: DatabaseSync,
  email: string,
  now?: Date,
): boolean;
