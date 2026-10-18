/** Runs exactly one ten-account cohort, whose cases exercise both native engines and viewport widths. @module playwright-admission-entry-sample-config */
import { defineConfig } from "@playwright/test";
import { ADMISSION_ENTRY_SAMPLE } from "./tests/support/constants/admission-entry-sample";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "admission-entry-sample.spec.ts",
  tsconfig: "./tsconfig.admissions-e2e.json",
  timeout: ADMISSION_ENTRY_SAMPLE.testTimeoutMs,
  workers: 1,
  reporter: "list",
  use: { trace: "off", screenshot: "off", video: "off" },
});
