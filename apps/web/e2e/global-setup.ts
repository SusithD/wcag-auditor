import { writeFileSync } from "node:fs";
import { type FullConfig, request } from "@playwright/test";
import {
  ADMIN,
  AUTH_STATE,
  createInviteViaScript,
  inviteToken,
} from "./auth-constants";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string;
  writeFileSync(AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }));
  const context = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const link = createInviteViaScript(
    ADMIN.email,
    process.env.E2E_AUTH_DB as string,
    baseURL,
  );
  const signUp = await context.post("/api/auth/sign-up/email", {
    data: ADMIN,
    headers: { "X-Invite-Token": inviteToken(link) },
  });
  if (!signUp.ok()) {
    const signIn = await context.post("/api/auth/sign-in/email", {
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    if (!signIn.ok())
      throw new Error(`Could not sign in the e2e admin: ${signIn.status()}`);
  }
  await context.storageState({ path: AUTH_STATE });
  await context.dispose();
}
