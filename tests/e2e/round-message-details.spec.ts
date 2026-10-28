/**
 * Validates the round dialogs on the production build in both engines: the
 * message details sticky author header and the composer actions row paint the
 * same surface as their dialog panel in light and dark themes, and opening a
 * message with likes does not pop the "Le gustó a" hover card open by itself.
 *
 * Runs only through `pnpm test:ui`, which seeds a signed-in leader and
 * tribemate and leader messages with replies and likes on a disposable
 * database.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import {
  UI_TEST_ORIGIN,
  UI_TEST_SESSION_COOKIE_NAME,
  UI_TEST_SESSION_ENV,
} from "../../scripts/e2e/ui-test-environment.mjs";

const seededSession = {
  discussedMessageTitle: process.env[UI_TEST_SESSION_ENV.discussedMessageTitle] ?? "",
  likedMessageTitle: process.env[UI_TEST_SESSION_ENV.likedMessageTitle] ?? "",
  sessionCookie: process.env[UI_TEST_SESSION_ENV.sessionCookie] ?? "",
  tribemateSessionCookie: process.env[UI_TEST_SESSION_ENV.tribemateSessionCookie] ?? "",
  tribeSlug: process.env[UI_TEST_SESSION_ENV.tribeSlug] ?? "",
};

/** Storage key read by the app theme provider. */
const THEME_STORAGE_KEY = "tutribu-theme";
const THEMES = ["light", "dark"] as const;
const DETAILS_HEADER_SELECTOR = '[data-slot="card-header"]';
/** CSS Modules keep the BEM name inside the hashed production class. */
const COMPOSER_ACTIONS_SELECTOR = '[class*="TribeRound__composerActions"]';
const COMPOSER_TRIGGER_LABEL = "Compartí algo en la ronda";
const COMPOSER_DIALOG_TITLE = "Crear mensaje";
/** First seeded reply: once it renders, the replies request has settled. */
const FIRST_SEEDED_REPLY = "Primer comentario sembrado.";
const LIKES_HOVER_CARD_TITLE = "Le gustó a";
/** Longer than @golfo/ui's 500ms hover card open delay, so a pending open would have fired. */
const HOVER_CARD_SETTLE_MS = 1200;
/** Wait per hydration attempt before clicking the trigger again. */
const HYDRATION_RETRY_MS = 2000;
/** Upper bound for the replies of a message to load after its details open, including a cold server route. */
const REPLIES_LOAD_TIMEOUT_MS = 15_000;

test.skip(
  !seededSession.sessionCookie || !seededSession.tribemateSessionCookie,
  "Needs the seeded session from `pnpm test:ui` (NEON_API_KEY + NEON_PROJECT_ID or E2E_DATABASE_URL)."
);

/** Signs the browser context in with one of the seeded sessions. */
async function signIn(context: BrowserContext, sessionCookie: string) {
  await context.addCookies([
    {
      httpOnly: true,
      name: UI_TEST_SESSION_COOKIE_NAME,
      sameSite: "Lax",
      url: UI_TEST_ORIGIN,
      value: sessionCookie,
    },
  ]);
}

function getDetailsTrigger(page: Page, messageTitle: string) {
  return page.getByRole("button", { name: `Abrir mensaje: ${messageTitle}` });
}

function getDetailsDialog(page: Page) {
  return page.getByRole("dialog", { name: "Mensaje" });
}

/**
 * Opens the round and clicks `trigger` until `dialog` shows, since a click
 * on server HTML before hydration does nothing. A slow opening is not clicked
 * again: the open dialog hides the page, trigger included, from the
 * accessibility tree.
 */
async function openDialog(page: Page, trigger: Locator, dialog: Locator) {
  await page.goto(`/${seededSession.tribeSlug}`);
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click({ timeout: HYDRATION_RETRY_MS });
    await expect(dialog).toBeVisible({ timeout: HYDRATION_RETRY_MS });
  }).toPass();

  return dialog;
}

function openMessageDetails(page: Page, messageTitle: string) {
  return openDialog(page, getDetailsTrigger(page, messageTitle), getDetailsDialog(page));
}

/** Stores the theme before the app boots and confirms the document applied it. */
async function applyTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: THEME_STORAGE_KEY,
    value: theme,
  });
}

async function expectThemeApplied(page: Page, theme: (typeof THEMES)[number]) {
  if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
  else await expect(page.locator("html")).not.toHaveClass(/dark/);
}

/** Reads the computed background and shadow of a row inside the dialog, and the panel background. */
function readSurfaces(dialog: Locator, rowSelector: string) {
  return dialog.evaluate((panel, selector) => {
    const row = panel.querySelector(selector);
    if (!row) throw new Error(`round-message-details: missing ${selector} in the dialog`);
    const rowStyle = getComputedStyle(row);
    return {
      panelBackground: getComputedStyle(panel).backgroundColor,
      rowBackground: rowStyle.backgroundColor,
      rowShadow: rowStyle.boxShadow,
    };
  }, rowSelector);
}

test.describe("viewed by the leader", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, seededSession.sessionCookie);
  });

  for (const theme of THEMES) {
    test(`details header paints the panel surface in the ${theme} theme`, async ({ page }) => {
      await applyTheme(page, theme);
      const dialog = await openMessageDetails(page, seededSession.discussedMessageTitle);
      await expect(dialog.getByText(FIRST_SEEDED_REPLY)).toBeVisible({ timeout: REPLIES_LOAD_TIMEOUT_MS });
      await expectThemeApplied(page, theme);

      const surfaces = await readSurfaces(dialog, DETAILS_HEADER_SELECTOR);

      expect(surfaces.rowBackground).toBe(surfaces.panelBackground);
      expect(surfaces.rowShadow, "the header shadow that covers the scroll gap uses the panel color").toContain(
        surfaces.panelBackground
      );
    });

    test(`composer actions row paints the panel surface in the ${theme} theme`, async ({ page }) => {
      await applyTheme(page, theme);
      const dialog = await openDialog(
        page,
        page.getByRole("button", { name: COMPOSER_TRIGGER_LABEL }),
        page.getByRole("dialog", { name: COMPOSER_DIALOG_TITLE })
      );
      await expectThemeApplied(page, theme);

      const surfaces = await readSurfaces(dialog, COMPOSER_ACTIONS_SELECTOR);

      expect(surfaces.rowBackground).toBe(surfaces.panelBackground);
    });
  }
});

/**
 * Moves the page clock past the hover card open delay, which fires any pending open at once, and asserts the likers
 * card stayed closed. The page clock must be installed before the page loads.
 */
async function expectLikesHoverCardClosed(page: Page, dialog: Locator) {
  await page.clock.runFor(HOVER_CARD_SETTLE_MS);

  await expect(page.getByText(LIKES_HOVER_CARD_TITLE)).toBeHidden();
  await expect(dialog.getByRole("button", { name: /^Me gusta/ })).not.toBeFocused();
}

test.describe("viewed by a tribemate, without the message actions menu", () => {
  test.beforeEach(async ({ context, page }) => {
    // The page clock keeps running in real time; it only lets the hover card checks skip ahead.
    await page.clock.install();
    await signIn(context, seededSession.tribemateSessionCookie);
  });

  test("opening a message with comments and likes leaves the likes hover card closed", async ({ page }) => {
    const dialog = await openMessageDetails(page, seededSession.discussedMessageTitle);
    await expect(dialog.getByText(FIRST_SEEDED_REPLY)).toBeVisible({ timeout: REPLIES_LOAD_TIMEOUT_MS });

    await expectLikesHoverCardClosed(page, dialog);
  });

  test("opening a message with likes and no comments leaves the likes hover card closed", async ({ page }) => {
    const dialog = await openMessageDetails(page, seededSession.likedMessageTitle);

    await expectLikesHoverCardClosed(page, dialog);
  });

  test("opening the details from the keyboard leaves the likes hover card closed", async ({ page }) => {
    const dialog = await openMessageDetails(page, seededSession.discussedMessageTitle);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await getDetailsTrigger(page, seededSession.discussedMessageTitle).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(FIRST_SEEDED_REPLY)).toBeVisible({ timeout: REPLIES_LOAD_TIMEOUT_MS });

    await expectLikesHoverCardClosed(page, dialog);
  });
});
