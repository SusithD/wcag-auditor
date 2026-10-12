import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import { ADMIN, AUTH_STATE } from "./e2e/auth-constants";

const port = Number(process.env.WEB_PORT ?? 3000);
const apiPort = Number(process.env.API_PORT ?? 8100);
const root = resolve(__dirname, "../..");
const dataDir = mkdtempSync(join(tmpdir(), `wcag-auditor-e2e-${apiPort}-`));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${port}`, storageState: AUTH_STATE },
  webServer: [
    {
      command: `uv run uvicorn app.main:app --app-dir services/app --port ${apiPort}`,
      cwd: root,
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATA_DIR: dataDir,
        AUDIT_PDF: "0",
        APP_ENV: "development",
        ALLOW_PRIVATE_TARGETS: "1",
        STUDY_PER_MINUTE: "0",
        RUNS_PER_MINUTE: "0",
        FOLDER_ROOTS: join(root, "fixtures"),
        EVAL_IMPORT_DIRS: join(root, "eval", "fixtures"),
        STUDY_ADMIN_TOKEN: "e2e-token",
        INTERNAL_API_TOKEN: "e2e-internal-token",
        BENCHMARK_DIR: join(root, "fixtures"),
      },
    },
    {
      command: `pnpm exec next start -p ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_URL: `http://127.0.0.1:${apiPort}`,
        INTERNAL_API_TOKEN: "e2e-internal-token",
        BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
        BETTER_AUTH_URL: `http://localhost:${port}`,
        AUTH_DB_PATH: join(dataDir, "auth.db"),
        AUTH_RATE_LIMIT: "0",
        ADMIN_EMAILS: ADMIN.email,
      },
    },
  ],
});
