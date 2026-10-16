/**
 * Validates that notifications stay usable while a dialog is open, inside a
 * real TuTribu screen: the calendar subscription dialog raises a success or an
 * error notification, and its close button answers the pointer and the
 * keyboard (Sonner's Alt+T shortcut) without closing the dialog; once the
 * notification is gone, the focus returns to the control that raised it.
 *
 * The dialog and its subscription load are real. Only the response of the
 * link request (`POST .../events/calendar-feed`) is answered by the test, so
 * every project gets the same success or failure without issuing a real link:
 * the seeded member keeps no subscription, so parallel projects never race.
 *
 * Runs only through `pnpm test:ui`, which seeds a signed-in leader and a tribe
 * on a disposable database.
 */
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  UI_TEST_ORIGIN,
  UI_TEST_SESSION_COOKIE_NAME,
  UI_TEST_SESSION_ENV,
} from "../../scripts/e2e/ui-test-environment.mjs";

const seededSession = {
  sessionCookie: process.env[UI_TEST_SESSION_ENV.sessionCookie] ?? "",
  tribeSlug: process.env[UI_TEST_SESSION_ENV.tribeSlug] ?? "",
};

const CALENDAR_FEED_COPY = {
  dialogTitle: "Suscribirme al calendario",
  generateButton: "Generar link",
  generateFailure: "No pudimos generar tu link. Intentá de nuevo.",
  generateSuccess: "Link listo.",
  feedUrlLabel: "Tu link de calendario",
} as const;

/** Accessible name Sonner gives the close button of every notification. */
const TOAST_CLOSE_BUTTON_NAME = "Close toast";
const TOAST_SELECTOR = "[data-sonner-toast]";
const TOAST_LAYER_SELECTOR = "[data-sonner-toaster]";
/** Wait per hydration attempt before clicking the trigger again. */
const HYDRATION_RETRY_MS = 2000;
/** Upper bound of Tab presses to reach the close button from the notification list. */
const MAX_TAB_PRESSES_TO_CLOSE_BUTTON = 5;
const CALENDAR_FEED_REQUEST_METHOD = "POST";
const HTTP_STATUS = { internalServerError: 500, ok: 200 } as const;
/** Feed URL returned by the answered request; it is only shown in the dialog. */
const ANSWERED_FEED_URL = "https://calendar.tutribu.test/feed.ics";

type CalendarFeedAnswer = "failure" | "success";

test.skip(
  !seededSession.sessionCookie,
  "Needs the seeded session from `pnpm test:ui` (NEON_API_KEY + NEON_PROJECT_ID or E2E_DATABASE_URL)."
);

test.beforeEach(async ({ context }) => {
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
 * Answers the next link requests of the calendar subscription with a failure
 * or a valid issued link; the dialog load (`GET`) still reaches the server.
 */
async function answerCalendarFeedRequests(page: Page, answer: CalendarFeedAnswer) {
  await page.unrouteAll({ behavior: "wait" });
  await page.route(`**/api/tribes/${seededSession.tribeSlug}/events/calendar-feed`, async (route) => {
    if (route.request().method() !== CALENDAR_FEED_REQUEST_METHOD) {
      await route.fallback();
      return;
    }

    if (answer === "failure") {
      await route.fulfill({
        json: { message: CALENDAR_FEED_COPY.generateFailure },
        status: HTTP_STATUS.internalServerError,
      });
      return;
    }

    await route.fulfill({
      json: {
        feedUrl: ANSWERED_FEED_URL,
        message: CALENDAR_FEED_COPY.generateSuccess,
        subscription: { createdAt: new Date().toISOString(), id: randomUUID(), lastUsedAt: null },
      },
      status: HTTP_STATUS.ok,
    });
  });
}

/**
 * Opens the calendar subscription dialog, retrying the click until the page
 * has hydrated (a click on server HTML before hydration does nothing).
 */
async function openCalendarFeedDialog(page: Page) {
  await page.goto(`/${seededSession.tribeSlug}/eventos`);
  const trigger = page.getByRole("button", { name: CALENDAR_FEED_COPY.dialogTitle });
  const dialog = page.getByRole("dialog", { name: CALENDAR_FEED_COPY.dialogTitle });
  await expect(async () => {
    // A slow opening can outlast one attempt; once the dialog is up, the trigger sits behind it.
    if (!(await dialog.isVisible())) await trigger.click({ timeout: HYDRATION_RETRY_MS });
    await expect(dialog).toBeVisible({ timeout: HYDRATION_RETRY_MS });
  }).toPass();

  return dialog;
}

function findToast(page: Page, text: string) {
  return page.locator(TOAST_SELECTOR).filter({ hasText: text });
}

test("a notification raised from an open dialog closes with the pointer and leaves the dialog open", async ({ page }) => {
  const dialog = await openCalendarFeedDialog(page);
  const generate = dialog.getByRole("button", { name: CALENDAR_FEED_COPY.generateButton });

  await answerCalendarFeedRequests(page, "failure");
  await generate.click();
  const errorToast = findToast(page, CALENDAR_FEED_COPY.generateFailure);
  await expect(errorToast).toHaveAttribute("data-type", "error");
  await errorToast.getByRole("button", { name: TOAST_CLOSE_BUTTON_NAME }).click();
  await expect(errorToast).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await answerCalendarFeedRequests(page, "success");
  await generate.click();
  const successToast = findToast(page, CALENDAR_FEED_COPY.generateSuccess);
  await expect(successToast).toHaveAttribute("data-type", "success");
  await successToast.getByRole("button", { name: TOAST_CLOSE_BUTTON_NAME }).click();
  await expect(successToast).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(CALENDAR_FEED_COPY.feedUrlLabel)).toHaveValue(ANSWERED_FEED_URL);
});

test("a notification raised from an open dialog closes with the keyboard and gives the focus back to the control that raised it", async ({ page }) => {
  const dialog = await openCalendarFeedDialog(page);
  const generate = dialog.getByRole("button", { name: CALENDAR_FEED_COPY.generateButton });

  await answerCalendarFeedRequests(page, "failure");
  await generate.focus();
  await page.keyboard.press("Enter");
  const errorToast = findToast(page, CALENDAR_FEED_COPY.generateFailure);
  await expect(errorToast).toBeVisible();
  // The button is disabled while the request runs, so Chromium drops its focus; put it back once it is usable.
  await expect(generate).toBeEnabled();
  await generate.focus();

  await page.keyboard.press("Alt+KeyT");
  await expect
    .poll(() => page.evaluate((selector) => document.activeElement?.closest(selector) !== null, TOAST_LAYER_SELECTOR))
    .toBe(true);

  const closeButton = errorToast.getByRole("button", { name: TOAST_CLOSE_BUTTON_NAME });
  for (let pressCount = 0; pressCount < MAX_TAB_PRESSES_TO_CLOSE_BUTTON; pressCount += 1) {
    if (await closeButton.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(errorToast).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(generate).toBeFocused();
});
