import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig } from "@playwright/test";

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
  use: { baseURL: `http://localhost:${port}` },
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
        FOLDER_ROOTS: join(root, "fixtures"),
        EVAL_IMPORT_DIRS: join(root, "eval", "fixtures"),
        STUDY_ADMIN_TOKEN: "e2e-token",
        BENCHMARK_DIR: join(root, "fixtures"),
      },
    },
    {
      command: `pnpm exec next start -p ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_URL: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
