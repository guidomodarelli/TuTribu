import { defineConfig, devices } from "@playwright/test";

/** Local port the bare `dev:next` server listens on during `pnpm test:e2e`. */
const E2E_PORT = 3000;

/** Origin Playwright drives; Better Auth must trust this same origin. */
const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;

/** Closes WebKit processes left behind by aborted runs on Windows; see the script header. */
const ORPHAN_WEBKIT_CLEANUP_PATH = "./scripts/e2e/clean-orphan-webkit-processes.mjs";

export default defineConfig({
  globalSetup: ORPHAN_WEBKIT_CLEANUP_PATH,
  globalTeardown: ORPHAN_WEBKIT_CLEANUP_PATH,
  testDir: "./tests/e2e",
  // The Beezping widget spec needs SITEPING_ENABLED and the portless route; it
  // runs only through playwright.beezping.config.ts (`pnpm test:e2e:beezping`).
  testIgnore: "beezping-provider.spec.ts",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: E2E_ORIGIN,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run dev:next -- --port ${E2E_PORT}`,
    port: E2E_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // `.env.local` may point BETTER_AUTH_URL at the Portless origin; Next never
    // overrides variables already in process.env, so pin auth to this origin.
    env: { BETTER_AUTH_URL: E2E_ORIGIN },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
