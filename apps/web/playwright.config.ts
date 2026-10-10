import { defineConfig } from "@playwright/test";

const port = Number(process.env.WEB_PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
