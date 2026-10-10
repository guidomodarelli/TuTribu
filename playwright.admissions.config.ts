/** Runs product admission flows on owned branch/server fixtures in both rendering engines. @module playwright-admissions-config */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["academy-admissions-manual.spec.ts", "academy-contact-verification.spec.ts", "academy-contact-retry.spec.ts"],
  tsconfig: "./tsconfig.admissions-e2e.json",
  timeout: 360_000,
  workers: 1,
  reporter: "list",
  use: { headless: true, trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "chromium-mobile", use: { browserName: "chromium", viewport: { width: 390, height: 900 } } },
    { name: "chromium-desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
    { name: "webkit-mobile", use: { browserName: "webkit", viewport: { width: 390, height: 900 } } },
    { name: "webkit-desktop", use: { browserName: "webkit", viewport: { width: 1280, height: 900 } } },
  ],
});
