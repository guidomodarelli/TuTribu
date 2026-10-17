/** @vitest-environment node */
/** Exercises real Next/SQL admission refresh with native clocks and no outbound message driver. @module admission-contextual-refresh-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium, webkit, expect as playwrightExpect, type BrowserContext, type Request } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionReviewHistoryDatabase, type AdmissionReviewHistoryTestIdentity } from "@/tests/support/admission-review-history-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { withAdmissionNativeFocusFrame } from "@/tests/support/admission-native-focus-frame";
import { createAdmissionReviewHistoryTestError } from "@/tests/support/admission-review-history-diagnostics";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { ADMISSION_CONTEXTUAL_REFRESH_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-contextual-refresh-validation";
import { ADMISSION_ACTIVITY_VALIDATION as BROWSER } from "@/tests/support/constants/admission-activity-validation";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { admissionOutcomeSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_NOTIFICATION_COPY, ADMISSION_NOTIFICATION_TYPE } from "@/src/modules/notifications/constants/admission-notifications";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";

const expectBrowser = playwrightExpect.configure({ timeout: VALIDATION.responseTimeoutMs });
/** Each viewport gets an independent owned branch and the real production build. */
const scenarios = [{ name: "chromium", engine: chromium, width: 390 }, { name: "chromium", engine: chromium, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }];

/** The request start and successful response must both belong to a count read after the confirmed decision. */
type NativeReadObservation = { readonly sequence: number; readonly startedAtMs: number; responseSucceeded: boolean; responseObservedAtMs?: number; finishedAtMs?: number; responseStatus?: number; failureObservedAtMs?: number };

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native admission contextual refresh", () => {
  it.each(scenarios)("should refresh current admission views on $name at $width without reloading or sending messages", async (scenario) => {
    let stage = "prepare_owned_fixture";
    const observations: Record<string, unknown> = { engine: scenario.name, width: scenario.width, realMessages: 0, latencyGateCertified: false };
    const artifacts = process.env[VALIDATION.artifactEnvironment] ?? join(process.cwd(), "test-results", "admission-contextual-refresh");
    await mkdir(artifacts, { recursive: true });
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
        const messagingSecurity = { environment: "synthetic-contextual-refresh", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
        const security = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
        const fixture = await prepareAdmissionReviewHistoryDatabase(database, security, (phase) => { stage = phase; });
        const applicant: AdmissionReviewHistoryTestIdentity = { userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), email: `refresh-${randomUUID()}@example.test` };
        stage = "seed_new_native_applicant";
        await database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicant.userId},${VALIDATION.incomingApplicantName},${applicant.email},false,clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${applicant.sessionId},${applicant.userId},${applicant.sessionToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        });
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
          const browser = await scenario.engine.launch({ headless: true });
          try {
            const reviewerContext = await browser.newContext({ viewport: { width: scenario.width, height: BROWSER.height }, reducedMotion: "reduce" });
            const applicantContext = await browser.newContext({ viewport: { width: scenario.width, height: BROWSER.height }, reducedMotion: "reduce" });
            /** @param context - Real browser context. @param identity - Synthetic native session bound only in memory. */
            const bind = async (context: BrowserContext, identity: AdmissionReviewHistoryTestIdentity) => {
              const value = encodeURIComponent(`${identity.sessionToken}.${await makeSignature(identity.sessionToken, secret)}`);
              await runPrivateBrowserRequest("bind_contextual_refresh_cookie", () => context.addCookies([{ name: "better-auth.session_token", value, url: origin, httpOnly: true, sameSite: "Lax" }]));
            };
            await bind(reviewerContext, fixture.guardian); await bind(applicantContext, applicant);
            const page = await reviewerContext.newPage();
            page.setDefaultTimeout(VALIDATION.responseTimeoutMs);
            const errors: string[] = [], reads: string[] = [], writes: string[] = [], documents: string[] = [];
            const countReads: NativeReadObservation[] = [], viewerReads: NativeReadObservation[] = [];
            const countRequests = new Map<Request, NativeReadObservation>(), viewerRequests = new Map<Request, NativeReadObservation>();
            let networkSequence = 0, expectedDecisionPath: string | null = null;
            const decisionObservation: { current: { sequence: number; observedAtMs: number } | null } = { current: null };
            observations.pageErrorNames = errors;
            observations.countReadTrace = countReads; observations.viewerReadTrace = viewerReads;
            observations.decisionResponseTrace = decisionObservation; observations.nativeWriteMethods = writes;
            page.on("pageerror", (error) => errors.push(error.name));
            page.on("request", (request) => {
              const path = new URL(request.url()).pathname;
              if (request.isNavigationRequest() && request.resourceType() === "document") documents.push("document");
              if (request.method() === "GET") {
                if (path === "/api/notifications") reads.push("inbox");
                else if (path === "/api/notifications/unread-count") {
                  reads.push("count");
                  const observation = { sequence: ++networkSequence, startedAtMs: performance.now(), responseSucceeded: false };
                  countReads.push(observation); countRequests.set(request, observation);
                }
                else if (path.includes("/admissions/requests")) reads.push("review");
                else if (path === "/api/auth/get-session") {
                  const observation = { sequence: ++networkSequence, startedAtMs: performance.now(), responseSucceeded: false };
                  viewerReads.push(observation); viewerRequests.set(request, observation);
                }
              }
              if (request.method() !== "GET" && path.includes("/admissions/")) writes.push(request.method());
            });
            page.on("response", (response) => {
              const request = response.request(), read = countRequests.get(request) ?? viewerRequests.get(request);
              if (read) { read.responseSucceeded = response.ok(); read.responseObservedAtMs = performance.now(); read.responseStatus = response.status(); }
              if (expectedDecisionPath && request.method() === "POST" && new URL(response.url()).pathname === expectedDecisionPath) {
                observations.nativeDecisionStatus = response.status();
                if (response.ok()) decisionObservation.current = { sequence: ++networkSequence, observedAtMs: performance.now() };
              }
            });
            page.on("requestfailed", (request) => {
              const read = countRequests.get(request) ?? viewerRequests.get(request);
              if (read) read.failureObservedAtMs = performance.now();
            });
            page.on("requestfinished", (request) => {
              const read = countRequests.get(request) ?? viewerRequests.get(request);
              if (read) read.finishedAtMs = performance.now();
            });
            stage = "open_foreground_reviewer";
            await runPrivateBrowserRequest("open_contextual_reviewer", () => page.goto(`${origin}/${fixture.slug}/academia/admissions`, { waitUntil: "domcontentloaded" }));
            await page.bringToFront();
            await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true })).toBeEnabled();
            await expectBrowser.poll(() => page.evaluate(() => document.hasFocus() && document.visibilityState === "visible")).toBe(true);
            const bell = page.getByRole("button", { name: /^Notificaciones/u });
            await bell.click();
            await expectBrowser(page.getByRole("heading", { name: "Notificaciones", exact: true })).toBeVisible();
            stage = "submit_new_pending_through_real_http";
            const submission = await runPrivateBrowserRequest("submit_contextual_refresh_request", () => applicantContext.request.post(`${origin}/api/tribes/${fixture.slug}/admissions/submissions`, { headers: { origin }, data: { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, message: "Quiero participar." } }));
            observations.submissionStatus = submission.status();
            expect(submission.ok()).toBe(true);
            const submitted = admissionOutcomeSchema.safeParse(await submission.json());
            if (!submitted.success || submitted.data.outcome !== "pending") throw new Error("Contextual refresh submission did not return a pending own request");
            const availableAt = Date.now();
            stage = "observe_real_clock_open_inbox_and_badge";
            const notice = page.getByRole("link", { name: new RegExp(ADMISSION_NOTIFICATION_COPY.reviewer[ADMISSION_NOTIFICATION_TYPE.pendingCreated], "u") });
            await expectBrowser(notice).toBeVisible();
            observations.inboxObservedAfterMs = Date.now() - availableAt;
            await expectBrowser(page.getByText(VALIDATION.incomingApplicantName, { exact: true })).toBeVisible();
            observations.reviewObservedAfterMs = Date.now() - availableAt;
            expect(reads.filter((area) => area === "inbox").length).toBeGreaterThan(1);
            expect(writes).toHaveLength(0);
            if (scenario.name === "chromium" && scenario.width === 1280) await captureAdmissionReview(page, "admission-refreshed-notices", [secret, applicant.email, applicant.sessionToken], VALIDATION.noticeCaptureFile, { selector: '[aria-labelledby="notification-panel-title"]' });
            stage = "fail_one_current_inbox_read";
            await page.route("**/api/notifications", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "dependency_unavailable", message: "No pudimos consultar tus avisos." } }) }), { times: 1 });
            await expectBrowser(page.getByRole("alert").filter({ hasText: VALIDATION.transientWarning })).toBeVisible();
            await expectBrowser(notice).toBeVisible();
            if (scenario.name === "chromium" && scenario.width === 1280) await captureAdmissionReview(page, "admission-notice-refresh-warning", [secret, applicant.email, applicant.sessionToken], VALIDATION.noticeCaptureFile, { selector: '[aria-labelledby="notification-panel-title"]' });
            stage = "recover_current_inbox_without_dismissing_cached_rows";
            await expectBrowser(page.getByRole("alert").filter({ hasText: VALIDATION.transientWarning })).toHaveCount(0);
            await expectBrowser(notice).toBeVisible();
            await page.keyboard.press("Escape");
            await expectBrowser(page.getByText(VALIDATION.incomingApplicantName, { exact: true })).toBeVisible();
            expect(documents).toHaveLength(1);
            stage = "open_real_application_native_focus_frame";
            await withAdmissionNativeFocusFrame(reviewerContext, `${origin}/${fixture.slug}/academia/admissions`, async (scope) => {
              const focusReads: string[] = [];
              scope.page.on("request", (request) => {
                const path = new URL(request.url()).pathname;
                if (request.method() !== "GET") return;
                if (path.includes("/admissions/requests")) focusReads.push("review");
                else if (path === "/api/notifications" || path === "/api/notifications/unread-count") focusReads.push("notifications");
              });
              await expectBrowser(scope.frame.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true })).toBeEnabled();
              await scope.focusApplication();
              await expectBrowser.poll(() => focusReads.filter((area) => area === "review").length).toBeGreaterThan(0);
              stage = "verify_real_browser_blur";
              await scope.focusOutside();
              await expectBrowser.poll(async () => {
                const facts = await scope.frame.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState }));
                observations.latestBlurFacts = facts;
                return !facts.focused;
              }).toBe(true);
              const readsBeforePause = focusReads.length, reviewReadsBeforePause = focusReads.filter((area) => area === "review").length;
              observations.readsBeforePause = [...focusReads];
              stage = "observe_no_requests_during_real_blur";
              await new Promise((resolve) => setTimeout(resolve, VALIDATION.pauseObservationMs));
              observations.readsAfterPause = [...focusReads];
              expect(focusReads).toHaveLength(readsBeforePause);
              stage = "restore_native_browser_foreground";
              await scope.focusApplication();
              await expectBrowser.poll(async () => {
                const facts = await scope.frame.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState }));
                observations.latestResumeFacts = facts;
                return facts.focused && facts.visibility === "visible";
              }).toBe(true);
              stage = "observe_requests_after_real_foreground_resume";
              await expectBrowser.poll(() => focusReads.filter((area) => area === "review").length).toBeGreaterThan(reviewReadsBeforePause);
            });
            stage = "select_current_native_reviewer_request";
            observations.beforeDecisionFocusFacts = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState }));
            observations.notificationHeadingsBeforeSelection = await page.getByRole("heading", { name: "Notificaciones", exact: true }).count();
            await page.getByRole("button", { name: `${ADMISSION_REVIEW_UI_COPY.detail}: ${VALIDATION.incomingApplicantName}`, exact: true }).click();
            stage = "prepare_native_reviewer_decision";
            await expectBrowser(page.getByLabel(ADMISSION_REVIEW_UI_COPY.internalReason, { exact: true })).toBeEnabled();
            await page.getByLabel(ADMISSION_REVIEW_UI_COPY.internalReason, { exact: true }).fill("Revisión de prueba controlada");
            await page.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm, exact: true }).check();
            expectedDecisionPath = `/api/tribes/${fixture.slug}/admissions/requests/${submitted.data.request.id}/decision`;
            stage = "send_native_reviewer_decision";
            await page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject, exact: true }).click();
            stage = "wait_native_decision_visible_confirmation";
            await expectBrowser(page.getByText(ADMISSION_REVIEW_UI_COPY.complete, { exact: true })).toBeVisible();
            stage = "observe_native_decision_response_confirmation";
            const confirmation = decisionObservation.current;
            if (!confirmation) throw new Error("Native contextual refresh did not observe the confirmed decision response");
            /** @returns Only the original GET that starts within the immediate reconciliation window; its response has the ordinary read timeout. */
            const currentCountRead = () => countReads.find((read) => read.sequence > confirmation.sequence && read.startedAtMs >= confirmation.observedAtMs && read.startedAtMs - confirmation.observedAtMs <= VALIDATION.ownReconciliationStartTimeoutMs);
            stage = "verify_current_count_read_after_confirmed_native_decision";
            await expectBrowser.poll(() => Boolean(currentCountRead()), { timeout: VALIDATION.ownReconciliationStartTimeoutMs }).toBe(true);
            const reconciled = currentCountRead();
            if (!reconciled) throw new Error("Native contextual refresh did not start a current count read");
            stage = "await_current_count_response_after_confirmed_native_decision";
            await expectBrowser.poll(() => reconciled.finishedAtMs !== undefined || reconciled.failureObservedAtMs !== undefined).toBe(true);
            expect(reconciled.failureObservedAtMs).toBeUndefined();
            expect(reconciled.responseSucceeded).toBe(true);
            observations.ownReconciliationRequestAfterDecisionResponse = true;
            observations.ownReconciliationRequestDelayMs = Math.round(reconciled.startedAtMs - confirmation.observedAtMs);
            expect(writes).toEqual(["POST"]);
            expect(documents).toHaveLength(1);
            stage = "open_other_own_pending_request";
            await bind(applicantContext, fixture.applicant);
            const ownPage = await applicantContext.newPage(); ownPage.setDefaultTimeout(VALIDATION.responseTimeoutMs);
            const ownReads: string[] = [], ownWrites: string[] = [];
            ownPage.on("pageerror", (error) => errors.push(error.name));
            ownPage.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.includes("/admissions/") && request.method() !== "GET") ownWrites.push(request.method()); if (path.endsWith("/own-request")) ownReads.push("own"); });
            await runPrivateBrowserRequest("open_contextual_own_request", () => ownPage.goto(`${origin}${buildOwnAdmissionRequestRoute(fixture.slug, fixture.admissionRequestId)}`, { waitUntil: "domcontentloaded" }));
            await ownPage.bringToFront();
            await expectBrowser(ownPage.getByRole("checkbox")).toBeEnabled();
            const ownStatus = ownPage.getByRole("region", { name: "Estado de tu solicitud", exact: true });
            await expectBrowser(ownStatus.getByText(ADMISSION_UI_COPY.pending, { exact: true })).toBeVisible();
            stage = "decide_pending_request_from_other_real_session";
            const decision = await runPrivateBrowserRequest("decide_contextual_own_request", () => reviewerContext.request.post(`${origin}/api/tribes/${fixture.slug}/admissions/requests/${fixture.admissionRequestId}/decision`, { headers: { origin }, data: { operationId: randomUUID(), confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Aprobación de prueba controlada" } }));
            observations.decisionStatus = decision.status(); expect(decision.ok()).toBe(true);
            const decisionAvailableAt = Date.now();
            stage = "observe_real_clock_own_terminal_state";
            await expectBrowser(ownStatus.getByText(ADMISSION_UI_COPY.approved, { exact: true })).toBeVisible();
            observations.ownTerminalObservedAfterMs = Date.now() - decisionAvailableAt;
            await expectBrowser(ownPage.getByText(ADMISSION_UI_COPY.pending, { exact: true })).toHaveCount(0);
            const ownReadsAtTerminal = ownReads.length;
            await new Promise((resolve) => setTimeout(resolve, VALIDATION.terminalObservationMs));
            expect(ownReads).toHaveLength(ownReadsAtTerminal); expect(ownWrites).toHaveLength(0);
            observations.ownTerminalReadCount = ownReadsAtTerminal;
            expect(errors).toHaveLength(0);
            expect(await ownPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            if (scenario.name === "chromium" && scenario.width === 1280) await captureAdmissionReview(ownPage, "admission-own-refreshed-terminal", [secret, fixture.applicant.email, fixture.applicant.sessionToken], VALIDATION.ownCaptureFile);
            await ownStatus.screenshot({ path: join(artifacts, `${scenario.name}-${scenario.width}-own-terminal.png`) });
            await ownPage.close(); await reviewerContext.close(); await applicantContext.close();
          } finally { await browser.close(); }
        }, { messagingSecurity }));
      });
      observations.branchOwnedAndRemovedByFixture = true;
      stage = "completed";
    } catch (error) { throw createAdmissionReviewHistoryTestError(error, `contextual_refresh_${stage}`); }
    finally { await writeFile(join(artifacts, `${scenario.name}-${scenario.width}-result.json`), JSON.stringify({ ...observations, stage }, null, 2), "utf8"); }
  }, VALIDATION.testTimeoutMs);
});
