/**
 * Validates the beez-ui dialog motion contract inside real TuTribu screens: a
 * product dialog (`DialogContent`) and a confirmation (`AlertDialogContent`)
 * unfold from their center and fold back into it, appear without animation
 * when the visitor asks for reduced motion, and the round message details
 * modal does not shift once its entrance settles.
 *
 * Runs only through `pnpm test:ui`, which seeds a signed-in leader, a tribe, a
 * round message and an event on a disposable database.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  UI_TEST_ORIGIN,
  UI_TEST_SESSION_COOKIE_NAME,
  UI_TEST_SESSION_ENV,
} from "../../scripts/e2e/ui-test-environment.mjs";

const seededSession = {
  eventTitle: process.env[UI_TEST_SESSION_ENV.eventTitle] ?? "",
  messageTitle: process.env[UI_TEST_SESSION_ENV.messageTitle] ?? "",
  sessionCookie: process.env[UI_TEST_SESSION_ENV.sessionCookie] ?? "",
  tribeSlug: process.env[UI_TEST_SESSION_ENV.tribeSlug] ?? "",
};

const DIALOG_CONTENT_SELECTOR = {
  alert: '[data-slot="alert-dialog-content"]',
  dialog: '[data-slot="dialog-content"]',
} as const;

/** Upper bound for an opening to settle or a closing to unmount, including route data and slow frames. */
const RECORDING_TIMEOUT_MS = 10_000;
/** Wait per hydration attempt before clicking the trigger again. */
const HYDRATION_RETRY_MS = 2000;
/** Odd viewport so a naive centering would land on a half pixel. */
const ODD_DESKTOP_VIEWPORT = { height: 721, width: 1281 };
/**
 * One frame of the dialog content: computed opacity, `clip-path` and its
 * `inset()` lengths (`calc()` groups kept whole); `null` while unmounted.
 */
type DialogFrame = { clipPath: string; insets: string[]; opacity: number } | null;
type MountedFrame = NonNullable<DialogFrame>;
/** What ends a recording: the opening settling, or the closing unmounting the content. */
type RecordingEnd = "settled" | "unmounted";

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
 * Samples, on every animation frame, the opacity and `clip-path` of the
 * first element matching `selector` while `action` runs, so the test sees the
 * motion the visitor sees instead of the final state only. Recording ends
 * when the content is settled (`settled`) or gone (`unmounted`), so slow
 * frame rates, such as headless WebKit, never cut an animation short.
 */
async function recordDialogFrames(page: Page, selector: string, end: RecordingEnd, action: () => Promise<void>) {
  await page.evaluate(
    ({ contentSelector, recordingEnd, timeoutMs }) => {
      const insetFunction = /^inset\((.*?)(?:\s+round\s.*)?\)$/;
      const readInsets = (clipPath: string) => {
        const insets: string[] = [];
        let depth = 0;
        let current = "";
        for (const character of insetFunction.exec(clipPath)?.[1] ?? "") {
          if (character === "(") depth += 1;
          if (character === ")") depth -= 1;
          if (character === " " && depth === 0) {
            if (current) insets.push(current);
            current = "";
          } else {
            current += character;
          }
        }
        if (current) insets.push(current);
        return insets;
      };
      // Unclipped, or clipped only outside the box (negative insets keep the ring and shadow).
      const isSettledFrame = (frame: MountedFrame) =>
        frame.opacity === 1 && frame.insets.every((inset) => inset.startsWith("-"));

      const frames: DialogFrame[] = [];
      const recorder = window as typeof window & { __dialogFrames?: Promise<DialogFrame[]> };
      recorder.__dialogFrames = new Promise((resolve) => {
        const startedAt = performance.now();
        const sample = () => {
          const content = document.querySelector(contentSelector);
          let frame: DialogFrame = null;
          if (content) {
            const style = getComputedStyle(content);
            frame = { clipPath: style.clipPath, insets: readInsets(style.clipPath), opacity: Number(style.opacity) };
          }
          frames.push(frame);
          const ended = recordingEnd === "unmounted" ? frame === null : frame !== null && isSettledFrame(frame);
          if (ended || performance.now() - startedAt >= timeoutMs) resolve(frames);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
    },
    { contentSelector: selector, recordingEnd: end, timeoutMs: RECORDING_TIMEOUT_MS }
  );
  await action();

  return page.evaluate(() => (window as typeof window & { __dialogFrames?: Promise<DialogFrame[]> }).__dialogFrames ?? []);
}

function mountedFrames(frames: DialogFrame[]) {
  return frames.filter((frame): frame is MountedFrame => frame !== null);
}

/** Fully revealed: no inset reaches inside the box. */
function isRevealed(frame: MountedFrame) {
  return frame.insets.every((inset) => inset.startsWith("-"));
}

/** Clipped the same amount on every edge, so the surface grows from or shrinks into its center. */
function isCenteredClip(frame: MountedFrame) {
  return frame.insets.length > 0 && frame.insets.every((inset) => inset === frame.insets[0]);
}

function isSettled(frame: MountedFrame) {
  return frame.opacity === 1 && isRevealed(frame);
}

/** Asserts the center morph: partially clipped centered frames on the way in and out. */
function expectCenterMorph(openingFrames: DialogFrame[], closingFrames: DialogFrame[]) {
  const opening = mountedFrames(openingFrames);
  const unfolding = opening.filter((frame) => !isRevealed(frame));
  expect(unfolding.length, "opening unfolds through clipped frames").toBeGreaterThan(0);
  expect(unfolding.every(isCenteredClip), `opening unfolds from the center: ${unfolding[0]?.clipPath}`).toBe(true);
  expect(isSettled(opening.at(-1)!), `opening settles fully revealed: ${opening.at(-1)?.clipPath}`).toBe(true);

  const folding = mountedFrames(closingFrames).filter((frame) => !isRevealed(frame));
  expect(folding.length, "closing folds through clipped frames").toBeGreaterThan(0);
  expect(folding.every(isCenteredClip), `closing folds into the center: ${folding[0]?.clipPath}`).toBe(true);
  expect(closingFrames.at(-1), "closing unmounts the content").toBeNull();
}

/** Asserts reduced motion: every mounted frame is already settled, both ways. */
function expectNoMotion(openingFrames: DialogFrame[], closingFrames: DialogFrame[]) {
  const opening = mountedFrames(openingFrames);
  expect(opening.length, "the dialog appears").toBeGreaterThan(0);
  expect(opening.every(isSettled), "opening without animation").toBe(true);
  expect(mountedFrames(closingFrames).every(isSettled), "closing without animation").toBe(true);
  expect(closingFrames.at(-1), "closing unmounts the content").toBeNull();
}

/**
 * Opens and closes `dialog` once, retrying the click until the page has
 * hydrated (a click on server HTML before hydration does nothing), so the
 * recorded openings never race the first client render.
 */
async function warmUpDialog(page: Page, trigger: Locator, dialog: Locator) {
  await expect(async () => {
    await trigger.click({ timeout: HYDRATION_RETRY_MS });
    await expect(dialog).toBeVisible({ timeout: HYDRATION_RETRY_MS });
  }).toPass();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

/**
 * Opens and closes the event detail dialog, then opens the delete
 * confirmation from it (which replaces the detail) and cancels it.
 */
async function exerciseEventDialogs(page: Page) {
  await page.goto(`/${seededSession.tribeSlug}/eventos`);
  const eventTrigger = page.getByRole("button", { name: seededSession.eventTitle }).first();
  const eventDialog = page.getByRole("dialog", { name: seededSession.eventTitle });
  await warmUpDialog(page, eventTrigger, eventDialog);

  const openingDialogFrames = await recordDialogFrames(page, DIALOG_CONTENT_SELECTOR.dialog, "settled", () => eventTrigger.click());
  await expect(eventDialog).toBeVisible();
  const closingDialogFrames = await recordDialogFrames(page, DIALOG_CONTENT_SELECTOR.dialog, "unmounted", () => page.keyboard.press("Escape"));
  await expect(eventDialog).toBeHidden();

  await eventTrigger.click();
  const confirmation = page.getByRole("alertdialog", { name: "¿Eliminar este evento?" });
  const openingAlertFrames = await recordDialogFrames(page, DIALOG_CONTENT_SELECTOR.alert, "settled", () =>
    eventDialog.getByRole("button", { name: "Eliminar", exact: true }).click()
  );
  await expect(confirmation).toBeVisible();
  const closingAlertFrames = await recordDialogFrames(page, DIALOG_CONTENT_SELECTOR.alert, "unmounted", () =>
    confirmation.getByRole("button", { name: "Cancelar" }).click()
  );
  await expect(confirmation).toBeHidden();

  return {
    alert: { closing: closingAlertFrames, opening: openingAlertFrames },
    dialog: { closing: closingDialogFrames, opening: openingDialogFrames },
  };
}

test("product dialog and confirmation unfold from and fold into their center", async ({ page }) => {
  const frames = await exerciseEventDialogs(page);

  expectCenterMorph(frames.dialog.opening, frames.dialog.closing);
  expectCenterMorph(frames.alert.opening, frames.alert.closing);
});

test("product dialog and confirmation appear without animation under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frames = await exerciseEventDialogs(page);

  expectNoMotion(frames.dialog.opening, frames.dialog.closing);
  expectNoMotion(frames.alert.opening, frames.alert.closing);
});

/** Reads the dialog box in layout pixels (`clip-path` does not affect it). */
function readBox(dialog: Locator) {
  return dialog.evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { height, left, top, width };
  });
}

test("round message details modal stays on whole pixels when its entrance settles", async ({ isMobile, page }) => {
  test.skip(isMobile, "The pixel-snapped centering applies to the desktop modal; mobile opens it fullscreen.");
  await page.setViewportSize(ODD_DESKTOP_VIEWPORT);
  await page.goto(`/${seededSession.tribeSlug}`);

  const trigger = page.getByRole("button", { name: `Abrir mensaje: ${seededSession.messageTitle}` });
  const details = page.getByRole("dialog", { name: "Mensaje" });
  await warmUpDialog(page, trigger, details);
  const openingFrames = await recordDialogFrames(page, DIALOG_CONTENT_SELECTOR.dialog, "settled", () => trigger.click());
  await expect(details).toBeVisible();
  expect(isSettled(mountedFrames(openingFrames).at(-1)!), "entrance settled").toBe(true);

  const settledBox = await readBox(details);
  expect(Number.isInteger(settledBox.left), `left ${settledBox.left} is a whole pixel`).toBe(true);
  expect(Number.isInteger(settledBox.top), `top ${settledBox.top} is a whole pixel`).toBe(true);

  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await readBox(details)).toEqual(settledBox);
});
