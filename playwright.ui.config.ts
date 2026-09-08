/** Validates shared UI integration against the real production build in both browser engines. */
import { defineConfig, devices } from "@playwright/test";

/** Uses a dedicated local port so validation cannot reuse an unrelated development server. */
const UI_TEST_PORT = 3110;
const UI_TEST_ORIGIN = `http://127.0.0.1:${UI_TEST_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "theme-provider.spec.ts",
  use: { baseURL: UI_TEST_ORIGIN, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm exec next start --port ${UI_TEST_PORT}`,
    url: UI_TEST_ORIGIN,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
