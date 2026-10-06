/** Exercises the actual global route with no real Google authorization or sensitive operation. */
import { defineConfig, devices } from "@playwright/test";

const AUTH_SCREEN_TEST_PORT = 3111;
const AUTH_SCREEN_TEST_ORIGIN = `http://127.0.0.1:${AUTH_SCREEN_TEST_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "admission-reauthentication.spec.ts",
  workers: 1,
  use: { baseURL: AUTH_SCREEN_TEST_ORIGIN, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${AUTH_SCREEN_TEST_PORT}`,
    url: `${AUTH_SCREEN_TEST_ORIGIN}/auth/reauthenticate?intentId=invalid`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { SITEPING_ENABLED: "false" },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
