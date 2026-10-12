import { tmpdir } from "node:os";
import { join } from "node:path";

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
