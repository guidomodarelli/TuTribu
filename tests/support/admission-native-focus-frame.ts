/** Drives native frame focus because Playwright keeps every top-level page active independently. @module admission-native-focus-frame */
import type { BrowserContext, Frame, Page } from "@playwright/test";
import { ADMISSION_CONTEXTUAL_REFRESH_VALIDATION as VALIDATION } from "./constants/admission-contextual-refresh-validation";
import { ADMISSION_ACTIVITY_VALIDATION as BROWSER } from "./constants/admission-activity-validation";
import { runPrivateBrowserRequest } from "./private-browser-request";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";

/** Actual browser clicks change the child document's focus without overriding DOM facts or dispatching synthetic lifecycle events. */
type AdmissionNativeFocusScope = { readonly page: Page; readonly frame: Frame; readonly focusApplication: () => Promise<void>; readonly focusOutside: () => Promise<void> };

/**
 * Loads the genuine same-origin Next route inside a native frame; only its external focus control is fixture HTML.
 * @typeParam Result - Value returned by the scenario's assertions.
 * @param context - This scenario's already authenticated isolated native browser context.
 * @param applicationUrl - Existing production route on the owned local server.
 * @param run - Assertions against genuine application requests and browser focus/visibility facts.
 * @returns The original callback result after closing the fixture page.
 * @throws When the application frame is unavailable or the original scenario fails.
 */
export async function withAdmissionNativeFocusFrame<Result>(context: BrowserContext, applicationUrl: string, run: (scope: AdmissionNativeFocusScope) => Promise<Result>): Promise<Result> {
  const target = new URL(applicationUrl), host = new URL(VALIDATION.focusFixturePath, target.origin);
  const page = await context.newPage(); page.setDefaultTimeout(VALIDATION.responseTimeoutMs);
  try {
    await page.route(host.href, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="es"><meta charset="utf-8"><title>Verificación nativa de foco</title><style>html,body{margin:0}button{display:block}iframe{display:block;width:100%;height:${BROWSER.height}px;border:0}</style><button type="button">${VALIDATION.focusOutsideLabel}</button><iframe title="${VALIDATION.focusFrameTitle}" src="${target.href}"></iframe></html>` }));
    await runPrivateBrowserRequest("open_native_focus_fixture", () => page.goto(host.href, { waitUntil: "domcontentloaded" }));
    const element = await page.waitForSelector("iframe");
    const frame = await element?.contentFrame();
    if (!frame) throw new Error("AdmissionNativeFocusFrame.open failed: application_frame_unavailable");
    await frame.waitForURL((url) => url.origin === target.origin && url.pathname === target.pathname, { waitUntil: "domcontentloaded" });
    return await run({ page, frame, focusApplication: () => frame.getByRole("heading", { name: ADMISSION_REVIEW_UI_COPY.title, exact: true }).click(), focusOutside: () => page.getByRole("button", { name: VALIDATION.focusOutsideLabel, exact: true }).click() });
  } finally { await page.close(); }
}
