/** Configures genuine focus for an owned CI browser through supported engine APIs. */

/**
 * Removes Chromium's forced focus override before native keyboard/reader observations.
 * @param {import('@playwright/test').Page} page - Owned headed CI application page.
 * @returns {Promise<boolean>} Whether the override was disabled; WebKit retains its separately observed default.
 */
export async function configureAdmissionBrowserNativeFocus(page) {
  if (page.context().browser()?.browserType().name() !== "chromium") return false;
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  return true;
}
