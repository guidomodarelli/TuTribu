/** @vitest-environment node */
/** Exercises real request-history SSR, Next navigation, current native authority and safe captures on an owned branch. @module admission-review-history-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium, webkit, expect as playwrightExpect } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionReviewHistoryDatabase, type AdmissionReviewHistoryTestIdentity } from "@/tests/support/admission-review-history-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { createAdmissionReviewHistoryTestError } from "@/tests/support/admission-review-history-diagnostics";
import { ADMISSION_ACTIVITY_VALIDATION as BROWSER } from "@/tests/support/constants/admission-activity-validation";
import { ADMISSION_REVIEW_HISTORY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-review-history-validation";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_REVIEW_HISTORY_COPY } from "@/src/modules/academy-admissions/constants/admission-review-history-page";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "@/src/modules/academy-admissions/constants/admission-public-contract";

const expectBrowser = playwrightExpect.configure({ timeout: BROWSER.browserTimeoutMs });
/** Every engine/viewport runs its complete journey on an independently owned disposable branch. */
const scenarios = [{ name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "chromium", engine: chromium, width: 1280 }];

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native request history navigation", () => {
  it.each(scenarios)("should keep history current and scoped on $name at $width", async (scenario) => {
    let stage = VALIDATION.stages.prepare as string;
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
        const messagingSecurity = { environment: "synthetic-review-history", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
        const securityConfig = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
        const fixture = await prepareAdmissionReviewHistoryDatabase(database, securityConfig, (phase) => { stage = phase; });
        const reviewer = scenario.name === "chromium" && scenario.width === 1280 ? fixture.leader : fixture.guardian;
        const artifacts = process.env[VALIDATION.browser.artifactEnvironment] ?? join(process.cwd(), "test-results", "admission-review-history");
        await mkdir(artifacts, { recursive: true });
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
          const browser = await scenario.engine.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width: scenario.width, height: BROWSER.height }, reducedMotion: "reduce" });
            const page = await context.newPage(); page.setDefaultTimeout(BROWSER.browserTimeoutMs);
            const errors: string[] = [], writes: string[] = [], viewerReads: string[] = [], responseStatuses: { area: string; status: number }[] = [];
            try {
              /** @param identity - An already seeded synthetic native account. @returns Only browser cookie binding; raw credentials stay in memory. */
              const bind = async (identity: AdmissionReviewHistoryTestIdentity) => {
                const value = encodeURIComponent(`${identity.sessionToken}.${await makeSignature(identity.sessionToken, secret)}`);
                await runPrivateBrowserRequest("bind_review_history_cookie", () => context.addCookies([{ name: "better-auth.session_token", value, url: origin, httpOnly: true, sameSite: "Lax" }]));
              };
              await bind(reviewer);
              page.on("pageerror", (error) => errors.push(error.name));
              page.on("request", (request) => { const route = new URL(request.url()); if (request.method() !== "GET" && route.pathname.includes("/admissions/")) writes.push(request.method()); if (route.pathname === "/api/auth/get-session") viewerReads.push(route.pathname); });
              page.on("response", (response) => { const route = new URL(response.url()), area = route.pathname.includes("/history/") ? "history" : route.pathname.endsWith("/admissions") ? "review" : route.pathname === "/api/auth/get-session" ? "viewer" : null; if (area) responseStatuses.push({ area, status: response.status() }); });
              const forbidden = [secret, fixture.own.email, ...[fixture.leader, fixture.guardian, fixture.applicant, fixture.otherApplicant].flatMap((identity) => [identity.sessionToken, identity.sessionId, identity.email]), VALIDATION.privateNote, VALIDATION.unknownEvent, VALIDATION.unknownCause, fixture.foreignRequestId, fixture.otherRequestId];
              // The complete platform document legitimately projects the current viewer's own account-menu email.
              const ownMenuEmail = reviewer === fixture.leader ? fixture.own.email : reviewer.email;
              const globallyForbidden = forbidden.filter((privateValue) => privateValue !== ownMenuEmail);
              const captureForbidden = [...forbidden, fixture.tribeId, fixture.foreignTribeId, fixture.admissionRequestId, ...fixture.eventIds, reviewer.userId];
              const recordFrames = scenario.name === "chromium" && scenario.width === 1280;
              const query = new URLSearchParams({ request: fixture.admissionRequestId, limit: String(VALIDATION.scannedPageSize), status: "all", source: "common", search: "Mi selección conservada", needsVerification: "false", requiresExceptionReason: "true", submittedFrom: VALIDATION.browser.submittedFrom, submittedUntil: VALIDATION.browser.submittedUntil });
              stage = "open_authorized_detail";
              await page.goto(`${origin}/${fixture.slug}/academia/admissions?${query}`, { waitUntil: "domcontentloaded" });
              const historyLink = page.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.open, exact: true });
              stage = "wait_authorized_history_link";
              await expectBrowser(historyLink).toBeVisible();
              stage = "focus_authorized_history_link";
              await historyLink.focus(); await expectBrowser(historyLink).toBeFocused();
              stage = "navigate_history_by_keyboard";
              await historyLink.press("Enter");
              stage = "wait_history_destination_url";
              await page.waitForURL((url) => url.pathname.endsWith(`/history/${fixture.admissionRequestId}`));
              const initialHistoryUrl = page.url();
              stage = "wait_current_history_viewer";
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_HISTORY_COPY.refresh, exact: true })).toBeEnabled();
              stage = "verify_visible_history_facts";
              const historyRegion = page.getByRole("region", { name: ADMISSION_REVIEW_HISTORY_COPY.title, exact: true });
              const events = page.getByRole("list", { name: "Eventos de la solicitud", exact: true });
              await expectBrowser(events.getByRole("listitem")).toHaveCount(VALIDATION.scannedPageSize);
              await expectBrowser(page.getByRole("heading", { name: "Evento conservado", exact: true })).toBeVisible();
              await expectBrowser(events.getByText("Sin atribución disponible", { exact: true })).toHaveCount(VALIDATION.scannedPageSize);
              const historyText = await page.getByRole("region", { name: ADMISSION_REVIEW_HISTORY_COPY.title, exact: true }).innerText();
              for (const privateValue of forbidden) expect(historyText).not.toContain(privateValue);
              stage = "read_history_ssr_document";
              const ssr = await runPrivateBrowserRequest("read_history_ssr_document", () => context.request.get(initialHistoryUrl));
              expect(ssr.ok()).toBe(true);
              const html = await ssr.text();
              expect(html).toContain(ADMISSION_REVIEW_HISTORY_COPY.title);
              expect(html).toContain("Evento conservado");
              for (const [index, privateValue] of globallyForbidden.entries()) { stage = `verify_history_ssr_privacy_${index}`; expect(html).not.toContain(privateValue); }
              if (recordFrames) await captureAdmissionReview(page, "review-history-current", captureForbidden, VALIDATION.browser.captureFile, { selector: 'section[aria-label="Historial de la solicitud"]' });
              stage = "continue_original_history_cursor";
              const older = page.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.older, exact: true });
              const cursor = new URL((await older.getAttribute("href"))!, origin).searchParams.get("historyCursor")!;
              expect(cursor.split(ADMISSION_REVIEW_CURSOR_SEPARATOR)[0]).toMatch(VALIDATION.middleCursorPattern);
              await older.click(); await page.waitForURL((url) => url.searchParams.get("historyCursor") === cursor);
              await expectBrowser(page.getByRole("heading", { name: "Solicitud presentada", exact: true })).toBeVisible();
              await expectBrowser(events.getByRole("listitem")).toHaveCount(VALIDATION.scannedPageSize);
              await expectBrowser(page.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.older, exact: true })).toHaveCount(0);
              if (recordFrames) await captureAdmissionReview(page, "review-history-older", captureForbidden, VALIDATION.browser.captureFile, { selector: 'section[aria-label="Historial de la solicitud"]' });
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
              await page.getByRole("region", { name: ADMISSION_REVIEW_HISTORY_COPY.title, exact: true }).screenshot({ path: join(artifacts, `${scenario.name}-${scenario.width}-history.png`) });
              stage = "read_authorized_empty_cursor_page";
              const emptyUrl = new URL(initialHistoryUrl); emptyUrl.searchParams.set("historyCursor", `${VALIDATION.browser.oldestCursorAt}${ADMISSION_REVIEW_CURSOR_SEPARATOR}${randomUUID()}`);
              await page.goto(emptyUrl.href, { waitUntil: "domcontentloaded" });
              await expectBrowser(page.getByText(ADMISSION_REVIEW_HISTORY_COPY.empty, { exact: true })).toBeVisible();
              if (recordFrames) await captureAdmissionReview(page, "review-history-empty", captureForbidden, VALIDATION.browser.captureFile, { selector: 'section[aria-label="Historial de la solicitud"]' });
              await page.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.newest, exact: true }).click();
              await expectBrowser(page.getByRole("heading", { name: "Evento conservado", exact: true })).toBeVisible();
              stage = "return_to_selected_detail_without_losing_filters";
              await page.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.back, exact: true }).click();
              await page.waitForURL((url) => url.searchParams.get("request") === fixture.admissionRequestId);
              await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close, exact: true })).toBeEnabled();
              expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(Object.fromEntries(query));
              stage = "revoke_role_before_browser_history_restoration";
              await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${fixture.tribeId} and user_id=${reviewer.userId}`));
              await page.goBack({ waitUntil: "domcontentloaded" });
              // Next's independent shadow-DOM route announcer also owns role=alert; inspect this page's feedback only.
              stage = "verify_current_history_permission_denied";
              await expectBrowser(historyRegion.getByRole("alert")).toContainText(ADMISSION_ERROR_MESSAGE.permission_denied);
              stage = "verify_private_history_removed";
              await expectBrowser(historyRegion.getByRole("heading", { name: "Evento conservado", exact: true })).toHaveCount(0);
              await expectBrowser(historyRegion.getByRole("list", { name: "Eventos de la solicitud", exact: true })).toHaveCount(0);
              stage = "verify_one_platform_main";
              expect(await page.getByRole("main").count()).toBe(1);
              if (recordFrames) {
                stage = "capture_current_history_denial";
                await captureAdmissionReview(page, "review-history-denied", captureForbidden, VALIDATION.browser.captureFile, { selector: 'section[aria-label="Historial de la solicitud"]' });
              }
              stage = "deny_cross_request_and_non_reviewer";
              await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='active' where tribe_id=${fixture.tribeId} and user_id=${reviewer.userId}`));
              const foreign = new URL(initialHistoryUrl); foreign.pathname = foreign.pathname.replace(fixture.admissionRequestId, fixture.foreignRequestId);
              await page.goto(foreign.href, { waitUntil: "domcontentloaded" });
              await expectBrowser(historyRegion.getByRole("alert")).toContainText(ADMISSION_ERROR_MESSAGE.resource_unavailable);
              await bind(fixture.applicant); await page.goto(initialHistoryUrl, { waitUntil: "domcontentloaded" });
              await expectBrowser(historyRegion.getByRole("alert")).toContainText(ADMISSION_ERROR_MESSAGE.permission_denied);
              expect(errors).toEqual([]); expect(writes).toEqual([]);
              const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ operations: number; deliveries: number; unchanged_requests: number; request_events: number; exposures: number }>(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId}) as operations,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and status='pending' and version=1) as unchanged_requests,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_request' and resource_id=${fixture.admissionRequestId}) as request_events,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='authorized_exposure' and resource_id=${fixture.admissionRequestId}) as exposures`)).rows[0]);
              expect(effects).toMatchObject({ operations: 0, deliveries: 0, unchanged_requests: 2, request_events: fixture.eventIds.length });
              expect(effects.exposures).toBeGreaterThan(0);
              await writeFile(join(artifacts, `${scenario.name}-${scenario.width}-proof.json`), JSON.stringify({ at: new Date().toISOString(), engine: scenario.name, width: scenario.width, role: reviewer === fixture.leader ? "leader" : "guardian", errors, writes: writes.length, viewerReads: viewerReads.length, effects, externalMessagesSent: 0 }, null, 2));
            } catch (error) {
              const alertTexts = await page.getByRole("alert").allTextContents().catch(() => []);
              const errorCodes = Object.entries(ADMISSION_ERROR_MESSAGE).filter(([, message]) => alertTexts.some((text) => text.includes(message))).map(([code]) => code);
              const currentHistory = page.getByRole("region", { name: ADMISSION_REVIEW_HISTORY_COPY.title, exact: true });
              await writeFile(join(artifacts, `${scenario.name}-${scenario.width}-failure.json`), JSON.stringify({ stage, errorName: error instanceof Error ? error.name : "unknown", pageErrorNames: errors, writes: writes.length, viewerReads: viewerReads.length, responseStatuses, errorCodes, alertCount: await page.getByRole("alert").count().catch(() => null), ownedAlertCount: await currentHistory.getByRole("alert").count().catch(() => null), mainCount: await page.getByRole("main").count().catch(() => null), ownedEventCount: await currentHistory.getByRole("list", { name: "Eventos de la solicitud", exact: true }).getByRole("listitem").count().catch(() => null), historyLinks: await page.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.open, exact: true }).count().catch(() => null), historyPage: new URL(page.url()).pathname.includes("/history/") }, null, 2));
              throw error;
            } finally { await context.close(); }
          } finally { await browser.close(); }
        }, { messagingSecurity }));
      });
    } catch (error) {
      const diagnostic = createAdmissionReviewHistoryTestError(error, stage);
      process.stdout.write(JSON.stringify({ phase: "native_review_history_failure", engine: scenario.name, width: scenario.width, stage, diagnostic: diagnostic.message }) + "\n");
      throw diagnostic;
    }
  }, VALIDATION.browser.testTimeoutMs);
});
