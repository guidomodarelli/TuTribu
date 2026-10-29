/** Validates shared UI integration against the real production build in both browser engines. */
import { defineConfig, webkit } from "@playwright/test";

import { BROWSER_ENGINE_PROJECTS } from "./tests/e2e/support/browser-engine-projects";
import { installExitedBrowserStdioRelease } from "./tests/e2e/support/release-exited-browser-stdio";
import { UI_TEST_ORIGIN, UI_TEST_PORT } from "./scripts/e2e/ui-test-environment.mjs";

/** Workers load this config too, so WebKit's leftover processes on Windows cannot hang their shutdown. */
installExitedBrowserStdioRelease({ executablePaths: [webkit.executablePath()] });

export default defineConfig({
  // Closes WebKit processes left behind by aborted runs on Windows (see @golfo/cleaner).
  globalSetup: "@golfo/cleaner/playwright/global-setup",
  globalTeardown: "@golfo/cleaner/playwright/global-teardown",
  testDir: "./tests/e2e",
  testMatch: [
    "theme-provider.spec.ts",
    "privacy-policy.spec.ts",
    "dialog-motion.spec.ts",
    "mobile-sheet-menus.spec.ts",
    "toast-over-dialog.spec.ts",
    "round-message-details.spec.ts",
  ],
  use: { baseURL: UI_TEST_ORIGIN, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm exec next start --port ${UI_TEST_PORT}`,
    url: UI_TEST_ORIGIN,
    reuseExistingServer: false,
  },
  projects: BROWSER_ENGINE_PROJECTS,
});
