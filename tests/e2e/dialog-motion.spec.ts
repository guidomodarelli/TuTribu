/**
 * Validates the @astra-kit/ui dialog motion contract inside real TuTribu screens: a
 * product dialog (`DialogContent`) and a confirmation (`<Dialog alert>`)
 * play Arc's dialog transition (the panel rises from below while it grows from
 * a slightly smaller scale and fades in, then drops a little and shrinks while
 * it fades out), without any clip, appear without animation when the visitor
 * asks for reduced motion, and the round message details modal does not shift
 * once its entrance settles.
 *
 * Runs only through `pnpm test:ui`, which seeds a signed-in leader, a tribe, a
 * round message and an event on a disposable database.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  MOTION_DIALOG_DISTANCE,
  MOTION_DIALOG_EXIT_DISTANCE,
  MOTION_EXIT_SCALE,
  MOTION_SURFACE_SCALE,
} from "@astra-kit/ui";

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
/** Rounding allowed on computed scales, which the engine serializes with limited precision. */
const SCALE_TOLERANCE = 0.002;
/** Rounding allowed on computed translations, in CSS pixels. */
const TRANSLATE_TOLERANCE_PX = 0.5;

/**
 * One frame of the dialog content: computed opacity, `clip-path` and the
 * scale and translation of its computed `transform`; `null` while unmounted.
 */
type DialogFrame = { clipPath: string; opacity: number; scale: number; translateX: number; translateY: number } | null;
type MountedFrame = NonNullable<DialogFrame>;
/** What ends a recording: the opening settling, or the closing unmounting the content. */
type RecordingEnd = "settled" | "unmounted";
/** Range a moving frame must stay in: from the resting panel to the transition's far end. */
type MotionBounds = { distancePx: number; scale: number };

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
 * Samples, on every animation frame, the opacity, `clip-path` and transform of
 * the first element matching `selector` while `action` runs, so the test sees
 * the motion the visitor sees instead of the final state only. Recording ends
 * when the content is settled (`settled`) or gone (`unmounted`), so slow frame
 * rates, such as headless WebKit, never cut an animation short.
 */
async function recordDialogFrames(page: Page, selector: string, end: RecordingEnd, action: () => Promise<void>) {
  await page.evaluate(
    ({ contentSelector, recordingEnd, timeoutMs }) => {
      // `matrix(a, b, c, d, e, f)`: the transition only scales and translates, so `a` is the scale.
      const readTransform = (transform: string) => {
        if (transform === "none") return { scale: 1, translateX: 0, translateY: 0 };
        const values = /^matrix\((.*)\)$/.exec(transform)?.[1]?.split(",").map(Number) ?? [];
        return { scale: values[0] ?? Number.NaN, translateX: values[4] ?? Number.NaN, translateY: values[5] ?? Number.NaN };
      };
      const isSettledFrame = (frame: MountedFrame) =>
        frame.opacity === 1 && frame.scale === 1 && frame.translateX === 0 && frame.translateY === 0;

      const frames: DialogFrame[] = [];
      const recorder = window as typeof window & { __dialogFrames?: Promise<DialogFrame[]> };
      recorder.__dialogFrames = new Promise((resolve) => {
        const startedAt = performance.now();
        const sample = () => {
          const content = document.querySelector(contentSelector);
          let frame: DialogFrame = null;
          if (content) {
            const style = getComputedStyle(content);
            frame = { clipPath: style.clipPath, opacity: Number(style.opacity), ...readTransform(style.transform) };
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

/** At rest: fully opaque, untransformed and unclipped. */
function isSettled(frame: MountedFrame) {
  return (
    frame.opacity === 1 &&
    frame.clipPath === "none" &&
    frame.scale === 1 &&
    frame.translateX === 0 &&
    frame.translateY === 0
  );
}

/** Below its resting place and smaller than it: the frame shows the rise and the scale of Arc's transition. */
function isRisingAndScaled(frame: MountedFrame) {
  return frame.translateY > 0 && frame.scale < 1;
}

/**
 * Never clipped, never sideways, and only between the resting panel and the
 * far end of the transition: no center morph and no overshoot.
 */
function isWithinBounds(frame: MountedFrame, bounds: MotionBounds) {
  return (
    frame.clipPath === "none" &&
    Math.abs(frame.translateX) <= TRANSLATE_TOLERANCE_PX &&
    frame.translateY >= -TRANSLATE_TOLERANCE_PX &&
    frame.translateY <= bounds.distancePx + TRANSLATE_TOLERANCE_PX &&
    frame.scale >= bounds.scale - SCALE_TOLERANCE &&
    frame.scale <= 1 + SCALE_TOLERANCE
  );
}

function describeFrame(frame: MountedFrame | undefined) {
  return JSON.stringify(frame);
}

/**
 * Asserts Arc's dialog transition: the opening rises from up to
 * `MOTION_DIALOG_DISTANCE` px below and grows from `MOTION_SURFACE_SCALE`
 * while it fades in, then settles at rest; the closing drops up to
 * `MOTION_DIALOG_EXIT_DISTANCE` px and shrinks to `MOTION_EXIT_SCALE` while it
 * fades out, then unmounts. No frame is clipped.
 */
function expectArcDialogMotion(openingFrames: DialogFrame[], closingFrames: DialogFrame[]) {
  const opening = mountedFrames(openingFrames);
  const entering = opening.filter((frame) => !isSettled(frame));
  expect(entering.some(isRisingAndScaled), `opening rises and grows: ${describeFrame(entering[0])}`).toBe(true);
  expect(entering.some((frame) => frame.opacity < 1), "opening fades in").toBe(true);
  const enterBounds = { distancePx: MOTION_DIALOG_DISTANCE, scale: MOTION_SURFACE_SCALE };
  const outOfEnterBounds = opening.find((frame) => !isWithinBounds(frame, enterBounds));
  expect(outOfEnterBounds, `opening stays within Arc's entrance: ${describeFrame(outOfEnterBounds)}`).toBeUndefined();
  expect(isSettled(opening.at(-1)!), `opening settles at rest: ${describeFrame(opening.at(-1))}`).toBe(true);

  const closing = mountedFrames(closingFrames);
  const leaving = closing.filter((frame) => !isSettled(frame));
  expect(leaving.some(isRisingAndScaled), `closing drops and shrinks: ${describeFrame(leaving[0])}`).toBe(true);
  expect(leaving.some((frame) => frame.opacity < 1), "closing fades out").toBe(true);
  const exitBounds = { distancePx: MOTION_DIALOG_EXIT_DISTANCE, scale: MOTION_EXIT_SCALE };
  const outOfExitBounds = closing.find((frame) => !isWithinBounds(frame, exitBounds));
  expect(outOfExitBounds, `closing stays within Arc's exit: ${describeFrame(outOfExitBounds)}`).toBeUndefined();
  expect(closingFrames.at(-1), "closing unmounts the content").toBeNull();
}

/** Asserts reduced motion: every mounted frame is already at rest, both ways. */
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
 * recorded openings never race the first client render. A dialog that opened
 * slower than one attempt is not clicked again: the modal hides its trigger,
 * so a second click would wait for an element that never comes back.
 */
async function warmUpDialog(page: Page, trigger: Locator, dialog: Locator) {
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click({ timeout: HYDRATION_RETRY_MS });
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

test("product dialog and confirmation rise in and drop out with Arc's dialog transition", async ({ page }) => {
  const frames = await exerciseEventDialogs(page);

  expectArcDialogMotion(frames.dialog.opening, frames.dialog.closing);
  expectArcDialogMotion(frames.alert.opening, frames.alert.closing);
});

test("product dialog and confirmation appear without animation under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frames = await exerciseEventDialogs(page);

  expectNoMotion(frames.dialog.opening, frames.dialog.closing);
  expectNoMotion(frames.alert.opening, frames.alert.closing);
});

/** Reads the dialog box in layout pixels. */
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
