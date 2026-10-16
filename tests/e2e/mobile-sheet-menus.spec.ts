/**
 * Validates that a beez-ui menu opened from the mobile navigation sheet paints
 * over the sheet instead of behind it: the sheet is a modal layer, and the
 * tribe switcher's menu is portaled to the end of the document, so it must win
 * the stacking order to be seen and used.
 *
 * Runs only through `pnpm test:ui`, which seeds a signed-in leader and a tribe
 * on a disposable database. Phone projects tap; desktop projects shrink the
 * window below the sheet breakpoint and use the mouse, the narrow desktop
 * window where the menu used to stay hidden.
 */
import { expect, test, type Locator } from "@playwright/test";

import {
  UI_TEST_ORIGIN,
  UI_TEST_SESSION_COOKIE_NAME,
  UI_TEST_SESSION_ENV,
} from "../../scripts/e2e/ui-test-environment.mjs";

const seededSession = {
  sessionCookie: process.env[UI_TEST_SESSION_ENV.sessionCookie] ?? "",
  tribeSlug: process.env[UI_TEST_SESSION_ENV.tribeSlug] ?? "",
};

/** A desktop window narrower than the shell's sheet breakpoint (480px), so the sidebar opens as a sheet. */
const NARROW_DESKTOP_VIEWPORT = { height: 800, width: 420 };
/** Wait per hydration attempt before tapping the trigger again. */
const HYDRATION_RETRY_MS = 2000;
/** Upper bound for the sheet and the menu to finish entering. */
const SETTLE_TIMEOUT_MS = 10_000;

test.skip(
  !seededSession.sessionCookie,
  "Needs the seeded session from `pnpm test:ui` (NEON_API_KEY + NEON_PROJECT_ID or E2E_DATABASE_URL)."
);

test.beforeEach(async ({ context, hasTouch, page }) => {
  if (!hasTouch) await page.setViewportSize(NARROW_DESKTOP_VIEWPORT);
  await context.addCookies([
    {
      httpOnly: true,
      name: UI_TEST_SESSION_COOKIE_NAME,
      sameSite: "Lax",
      url: UI_TEST_ORIGIN,
      value: seededSession.sessionCookie,
    },
  ]);
});

/**
 * Reports whether the element painted at the center of `target` belongs to it,
 * which is false when another layer covers it. While a modal menu is open,
 * Radix turns every other layer to `pointer-events: none`, so plain hit-testing
 * sees through a sheet painted on top; pointer events are re-enabled for the
 * probe so it follows the paint order instead.
 * @param target - Element expected on top.
 * @returns True when `target` is the topmost painted element at its own center.
 */
async function isTopmostAtCenter(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const probeStyle = document.createElement("style");
    probeStyle.textContent = "* { pointer-events: auto !important; }";
    document.head.append(probeStyle);
    try {
      const box = element.getBoundingClientRect();
      const painted = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return painted !== null && element.contains(painted);
    } finally {
      probeStyle.remove();
    }
  });
}

test("should paint the tribe switcher menu over the mobile navigation sheet", async ({ hasTouch, page }) => {
  /** Taps on phones and clicks with the mouse on a narrow desktop window, as each visitor would. */
  const activate = (target: Locator) => (hasTouch ? target.tap() : target.click());
  await page.goto(`/${seededSession.tribeSlug}`);
  const openNavigation = page.getByRole("button", { name: "Abrir navegación" });
  const sheet = page.getByRole("dialog", { name: "Navegación" });
  // Taps again until hydration attaches the handler, as a visitor would.
  await expect(async () => {
    await activate(openNavigation);
    await expect(sheet).toBeVisible({ timeout: HYDRATION_RETRY_MS });
  }).toPass({ timeout: SETTLE_TIMEOUT_MS });

  await activate(sheet.locator('[aria-haspopup="menu"]').first());
  const createTribe = page.getByRole("menuitem", { name: "Nueva tribu" });
  await expect(createTribe).toBeVisible();

  await expect.poll(() => isTopmostAtCenter(createTribe), { timeout: SETTLE_TIMEOUT_MS }).toBe(true);
  await activate(createTribe);
  await expect(page).toHaveURL(/\/-\/crear$/);
});
