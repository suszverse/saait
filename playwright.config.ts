import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://localhost:5432/saait_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // Website first: run the same journeys on a phone and on a desktop.
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    // Its own database and the payment simulator; never the dev database.
    env: { DATABASE_URL: E2E_DB, PAYMENT_SIMULATOR: "on", DEPLOY_ENV: "local", DOCUMENT_DIR: "./.data/e2e-documents" },
    port: PORT,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
