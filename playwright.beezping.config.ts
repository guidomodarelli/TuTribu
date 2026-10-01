import { defineConfig, devices } from "@playwright/test";

/** Exercises the real application through the existing portless route. */
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "beezping-provider.spec.ts",
  fullyParallel: false, workers: 1,
  use: { baseURL: "https://dev-tutribu.app", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
