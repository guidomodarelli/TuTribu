/** @vitest-environment node */
/** Verifies real keyboard focus after cancellation/approval with current Next, both engines and native SQL. */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit, expect as expectBrowser } from "@playwright/test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatchBrowserDatabase, bindAdmissionBatchBrowserSession, submitAdmissionBatchBrowserRows } from "@/tests/support/admission-batch-browser-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { createAdmissionReviewBrowserInteractions } from "@/tests/support/admission-review-browser-interactions";
import { ADMISSION_REVIEW_BROWSER_INTERACTION } from "@/tests/support/constants/admission-review-keyboard-validation";
import { ADMISSION_TERMINAL_FOCUS as VALIDATION } from "@/tests/support/constants/admission-terminal-focus";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_RECOVERY_LOCK_VALUE } from "@/src/modules/messaging/constants/messaging-hosting";
import { buildAdmissionReviewRoute, buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";

describe.skipIf(process.env[VALIDATION.enabledVariable] !== VALIDATION.enabledValue)("native terminal action focus", () => {
  it("keeps a keyboard destination after real cancellation and approval in both engines and viewports", async () => {
    const root = process.env[VALIDATION.artifactVariable];
    if (!root) throw new Error("AdmissionTerminalFocus.prepare failed: explicit_artifact_root_required");
    await mkdir(root, { recursive: true });
    const observations: Array<{ engine: string; width: number; surface: string; focused: boolean; layoutFits: boolean }> = [];
    const failures: Array<{ engine: string; width: number; stage: string; code: string }> = [];
    const progress = (stage: string, engine?: string, width?: number) => process.stdout.write(JSON.stringify({ phase: "terminal_focus", stage, engine: engine ?? null, width: width ?? null }) + "\n");
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }]; }));
      const messagingSecurity = { environment: VALIDATION.environment, securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const security = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: MESSAGING_RECOVERY_LOCK_VALUE.unlocked, MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const scenarios = [{ name: "chromium", engine: chromium }, { name: "webkit", engine: webkit }].flatMap((browser) => VALIDATION.widths.map((width) => ({ ...browser, width })));
      const fixture = await prepareAdmissionBatchBrowserDatabase(database, security, scenarios.flatMap((scenario) => [`Cancelacion sintetica ${scenario.name} ${scenario.width}`, `Revision sintetica ${scenario.name} ${scenario.width}`]), (stage) => progress(stage));
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        progress("server_ready");
        for (const [scenarioIndex, { name, engine, width }] of scenarios.entries()) {
          const browser = await engine.launch({ headless: true });
          let stage: string = VALIDATION.stages.publicCancellation;
          const mutationStatuses: number[] = [];
          try {
            progress("browser_ready", name, width);
            const current = { ...fixture, applicants: fixture.applicants.slice(scenarioIndex * VALIDATION.participantsPerScenario, (scenarioIndex + 1) * VALIDATION.participantsPerScenario) };
            const applicant = await browser.newContext({ viewport: { width, height: VALIDATION.height }, reducedMotion: "reduce", locale: VALIDATION.locale });
            const rows = await submitAdmissionBatchBrowserRows(applicant, current, origin, secret);
            await applicant.clearCookies();
            await bindAdmissionBatchBrowserSession(applicant, current.applicants[0].identity, origin, secret);
            const page = await applicant.newPage(); page.setDefaultTimeout(VALIDATION.pageTimeoutMs);
            page.on("response", (response) => { if (response.request().method() === "POST") mutationStatuses.push(response.status()); });
            await runPrivateBrowserRequest("open_terminal_focus_request", () => page.goto(origin + buildOwnAdmissionRequestRoute(fixture.slug, rows[0].requestId), { waitUntil: "networkidle" }));
            const publicActions = createAdmissionReviewBrowserInteractions(page, ADMISSION_REVIEW_BROWSER_INTERACTION.keyboard);
            const confirmation = page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel, exact: true });
            await expectBrowser(confirmation).toBeEnabled(); await publicActions.check(confirmation);
            const cancellation = page.getByRole("button", { name: ADMISSION_UI_COPY.cancel, exact: true });
            await expectBrowser(cancellation).toBeEnabled(); await publicActions.activate(cancellation);
            const result = page.getByRole("region", { name: "Estado de tu solicitud", exact: true }).getByText(ADMISSION_UI_COPY.cancelled, { exact: true });
            await result.waitFor({ state: "visible" });
            await expectBrowser(page.locator("main[aria-busy]")).toHaveAttribute("aria-busy", "false", { timeout: VALIDATION.pageTimeoutMs });
            await expectBrowser(result).toBeFocused();
            const publicFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
            expect(publicFits).toBe(true);
            await page.screenshot({ path: join(root, `${name}-${width}-public.png`) });
            observations.push({ engine: name, width, surface: "public", focused: true, layoutFits: publicFits });
            await applicant.close();

            stage = VALIDATION.stages.administrativeApproval;
            const reviewer = await browser.newContext({ viewport: { width, height: VALIDATION.height }, reducedMotion: "reduce", locale: VALIDATION.locale });
            await bindAdmissionBatchBrowserSession(reviewer, fixture.guardian, origin, secret);
            const review = await reviewer.newPage(); review.setDefaultTimeout(VALIDATION.pageTimeoutMs);
            review.on("response", (response) => { if (response.request().method() === "POST") mutationStatuses.push(response.status()); });
            await runPrivateBrowserRequest("open_terminal_focus_review", () => review.goto(origin + buildAdmissionReviewRoute(fixture.slug, rows[1].requestId), { waitUntil: "networkidle" }));
            const reviewActions = createAdmissionReviewBrowserInteractions(review, ADMISSION_REVIEW_BROWSER_INTERACTION.keyboard);
            const reason = review.getByRole("textbox", { name: ADMISSION_REVIEW_UI_COPY.internalReason, exact: true });
            await expectBrowser(reason).toBeEnabled(); await reviewActions.fill(reason, VALIDATION.internalReason);
            await reviewActions.check(review.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm, exact: true }));
            const approval = review.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve, exact: true });
            await expectBrowser(approval).toBeEnabled(); await reviewActions.activate(approval);
            const reviewResult = review.getByRole("main").getByRole("status").filter({ hasText: ADMISSION_REVIEW_UI_COPY.complete });
            await reviewResult.waitFor({ state: "visible" });
            await expectBrowser(reviewResult).toBeFocused();
            const reviewFits = await review.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
            expect(reviewFits).toBe(true);
            await review.screenshot({ path: join(root, `${name}-${width}-administrative.png`) });
            observations.push({ engine: name, width, surface: "administrative", focused: true, layoutFits: reviewFits });
            await reviewer.close();
            stage = VALIDATION.stages.sqlEffects;
            const facts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select
              (select status from public.academy_admission_requests where id=${rows[0].requestId}) as public_status,
              (select status from public.academy_admission_requests where id=${rows[1].requestId}) as review_status,
              (select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${current.applicants[1].identity.userId} and role=${TRIBE_MEMBER_ROLE.tribemate} and status=${TRIBE_MEMBERSHIP_STATUS.active}) as basic_members,
              (select count(*)::integer from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
            expect(facts).toEqual({ public_status: ADMISSION_REQUEST_STATUS.cancelled, review_status: ADMISSION_REQUEST_STATUS.approved, basic_members: 1, deliveries: 0 });
            progress("effects_confirmed", name, width);
            await writeFile(join(root, "observations.json"), JSON.stringify({ observations, realMessages: 0 }, null, 2));
          } catch (error) {
            // Private browser errors can retain transport traces; project only fixed classifications and UI counters.
            const code = error instanceof Error && error.name === "TimeoutError" ? VALIDATION.failureCodes.timeout : error instanceof Error && error.name === "AssertionError" ? VALIDATION.failureCodes.assertion : VALIDATION.failureCodes.unexpected;
            const pages = browser.contexts().flatMap((context) => context.pages());
            const interfaces = await Promise.all(pages.map(async (page) => ({
              cancellationMessages: await page.getByText(ADMISSION_UI_COPY.cancelled, { exact: true }).count(),
              cancellationControls: await page.getByRole("button", { name: ADMISSION_UI_COPY.cancel, exact: true }).count(),
              approvalMessages: await page.getByRole("status").filter({ hasText: ADMISSION_REVIEW_UI_COPY.complete }).count(),
              alerts: await page.getByRole("alert").count(), busyMainRegions: await page.locator('main[aria-busy="true"]').count(),
              activeTag: await page.evaluate(() => document.activeElement?.tagName ?? null),
            }))).catch(() => null);
            await Promise.allSettled(pages.map((page, pageIndex) => page.screenshot({ path: join(root, `${name}-${width}-failed-${pageIndex}.png`) })));
            failures.push({ engine: name, width, stage, code });
            await writeFile(join(root, `${name}-${width}-failure.json`), JSON.stringify({ engine: name, width, stage, code, interfaces, mutationStatuses }, null, 2));
            await writeFile(join(root, "failures.json"), JSON.stringify(failures, null, 2));
          } finally { await browser.close(); }
        }
        expect(failures).toEqual([]);
        expect(observations).toHaveLength(scenarios.length * VALIDATION.surfacesPerScenario);
      }, { messagingSecurity }));
    }, { databaseSelection: { databaseName: VALIDATION.databaseName, roleName: VALIDATION.roleName } });
  }, VALIDATION.timeoutMs);
});
