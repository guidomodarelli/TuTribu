/** Uses real native traversal and keystrokes for the administrative review journey. @module admission-review-browser-interactions */
import type { Locator, Page } from "@playwright/test";
import { runPrivateBrowserRequest } from "./private-browser-request";
import { ADMISSION_REVIEW_BROWSER_INTERACTION, ADMISSION_REVIEW_KEYBOARD_VALIDATION, type AdmissionReviewBrowserInteraction } from "./constants/admission-review-keyboard-validation";

/**
 * Reaches the control only through actual tab order; no target focus or DOM event is synthesized.
 * @param page - Current owned real browser page.
 * @param control - Product control whose native keyboard reachability is required.
 * @returns After the actual focused element matches the target; otherwise a safe fixed diagnostic.
 */
async function tabToReviewControl(page: Page, control: Locator): Promise<void> {
  await runPrivateBrowserRequest("traverse_admission_review_control", async () => {
    await page.bringToFront();
    await control.waitFor({ state: "visible" });
    if (await control.evaluate((element) => element === document.activeElement)) return;
    const count = await page.locator('a[href],button,input,select,textarea,[tabindex]').count();
    const steps = Math.min(count + 1, ADMISSION_REVIEW_KEYBOARD_VALIDATION.maximumTraversalSteps);
    for (const key of ["Tab", "Shift+Tab"]) {
      await page.bringToFront();
      for (let step = 0; step < steps; step += 1) {
        await page.keyboard.press(key);
        if (await control.evaluate((element) => element === document.activeElement)) return;
      }
    }
    throw new Error("Admission review control was not reachable through native tab order");
  });
}

/** @param page - Exact real review page. @param interaction - Current journey's native input method. @returns Actions that keep all product controls, handlers and persistence real. */
export function createAdmissionReviewBrowserInteractions(page: Page, interaction: AdmissionReviewBrowserInteraction) {
  const keyboard = interaction === ADMISSION_REVIEW_BROWSER_INTERACTION.keyboard;
  return {
    /** @param control - Visible enabled product command. @returns After its real pointer or keyboard activation. */
    async activate(control: Locator) {
      if (!keyboard) { await control.click(); return; }
      await tabToReviewControl(page, control);
      await page.keyboard.press("Enter");
    },
    /** @param control - Actual product checkbox. @returns After explicit selection, preserving its native input path. */
    async check(control: Locator) {
      if (!keyboard) { await control.check(); return; }
      await tabToReviewControl(page, control);
      if (!await control.isChecked()) await page.keyboard.press("Space");
    },
    /** @param control - Actual product text input. @param value - Test-only text, never exported in diagnostics. @returns After real keyboard entry or the established pointer journey's fill. */
    async fill(control: Locator, value: string) {
      if (!keyboard) { await control.fill(value); return; }
      await tabToReviewControl(page, control);
      await runPrivateBrowserRequest("type_admission_review_text", async () => { await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type(value); });
    },
  };
}
