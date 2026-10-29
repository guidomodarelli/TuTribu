import { defineConfig, webkit } from "@playwright/test";

import { BROWSER_ENGINE_PROJECTS } from "./tests/e2e/support/browser-engine-projects";
import { installExitedBrowserStdioRelease } from "./tests/e2e/support/release-exited-browser-stdio";

/** Workers load this config too, so WebKit's leftover processes on Windows cannot hang their shutdown. */
installExitedBrowserStdioRelease({ executablePaths: [webkit.executablePath()] });

/** Exercises the real application through the existing portless route. */
export default defineConfig({
  // Closes WebKit processes left behind by aborted runs on Windows (see @golfo/cleaner).
  globalSetup: "@golfo/cleaner/playwright/global-setup",
  globalTeardown: "@golfo/cleaner/playwright/global-teardown",
  testDir: "./tests/e2e", testMatch: "beezping-provider.spec.ts",
  fullyParallel: false, workers: 1,
  use: { baseURL: "https://dev.tutribu.app", trace: "retain-on-failure" },
  projects: BROWSER_ENGINE_PROJECTS,
});
