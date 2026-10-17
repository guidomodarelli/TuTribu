/** Orders native checkbox scrolling before the pointer action's stability checks. @module visible-checkbox-test-support */
import { expect, type Locator } from "@playwright/test";

/** @param checkbox - Publicly labelled real checkbox. @param checked - Requested state. @param timeoutMs - Existing caller's action bound. @returns After the enabled, scrolled control confirms its requested state through a real pointer action. */
export async function setVisibleCheckboxChecked(checkbox: Locator, checked: boolean, timeoutMs: number): Promise<void> {
  await expect(checkbox).toBeEnabled({ timeout: timeoutMs });
  await checkbox.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await checkbox.setChecked(checked, { timeout: timeoutMs });
}
