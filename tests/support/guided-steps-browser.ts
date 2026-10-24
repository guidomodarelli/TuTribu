/** Waits for guided flows in native browser tests without depending on their animation timing. @module guided-steps-browser */
import type { Page } from "@playwright/test";

/** Time a step that slides out may stay mounted before the next interaction. */
const GUIDED_STEP_SETTLE_TIMEOUT_MS = 30_000;

/** @param page - Actual owned browser page. @returns Once no inert step that is sliding out remains, so locators see only the current step. */
export async function settleGuidedStep(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll("fieldset[inert]").length === 0, undefined, { timeout: GUIDED_STEP_SETTLE_TIMEOUT_MS });
}
