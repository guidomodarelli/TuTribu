/** @vitest-environment node */
/** Exercises genuine cancellation and approval with native reader output and independently persisted effects. */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit, expect as expectBrowser } from "@playwright/test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatchBrowserDatabase, bindAdmissionBatchBrowserSession, submitAdmissionBatchBrowserRows } from "@/tests/support/admission-batch-browser-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { createAdmissionNativeReader } from "@/tests/support/admission-native-reader.mjs";
import { ADMISSION_READER_JOURNEYS as VALIDATION } from "@/tests/support/constants/admission-reader-journeys";
import { ADMISSION_READER_PROBE } from "@/tests/support/constants/admission-reader-probe.mjs";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { buildAdmissionReviewRoute, buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";

describe.skipIf(process.env[VALIDATION.enabledVariable] !== VALIDATION.enabledValue)("native Linux reader product journeys", () => {
  it("should announce real cancellation and approval in both engines and widths with exact SQL effects", async () => {
    const root = process.env[VALIDATION.artifactVariable], authorization = process.env[VALIDATION.authorizationVariable], ownershipNonce = process.env[VALIDATION.nonceVariable];
    if (!root || !authorization || !ownershipNonce) throw new Error("AdmissionReaderJourneys.prepare failed: explicit_owned_capability_required");
    await mkdir(root, { recursive: true });
    const observations: unknown[] = [];
    const diagnostics: unknown[] = [], failures: unknown[] = [];
    let latestMilestone: { stage: string; engine: string | null; width: number | null } | null = null;
    /** @param stage - Fixed safe execution milestone. @param engine - Current browser or preparation. @param width - Current viewport when applicable. @returns After safe progress is retained without private values. */
    const progress = async (stage: string, engine?: string, width?: number): Promise<void> => {
      const milestone = { stage, engine: engine ?? null, width: width ?? null };
      latestMilestone = milestone;
      await writeFile(join(root, "progress.json"), JSON.stringify(milestone) + "\n");
      process.stdout.write(JSON.stringify({ phase: "reader_product_stage", ...milestone }) + "\n");
    };
    const reader = createAdmissionNativeReader({ onFailure: async (diagnostic) => {
      diagnostics.push({ ...latestMilestone, ...diagnostic });
      await writeFile(join(root, "reader-diagnostics.json"), JSON.stringify(diagnostics, null, 2) + "\n");
    } });
    await progress("database_starting");
    await withAcademyAdmissionDatabase(async (database) => {
      await progress("database_ready");
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }]; }));
      const messagingSecurity = { environment: VALIDATION.environment, securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const security = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const scenarios = [{ name: "chromium", engine: chromium }, { name: "webkit", engine: webkit }].flatMap((browser) => ADMISSION_READER_PROBE.widths.map((width) => ({ ...browser, width })));
      const fixture = await prepareAdmissionBatchBrowserDatabase(database, security, scenarios.flatMap((scenario) => [`Persona de cancelacion ${scenario.name} ${scenario.width}`, `Persona de revision ${scenario.name} ${scenario.width}`]));
      await progress("fixture_ready");
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        await progress("server_ready");
        for (const [scenarioIndex, { name, engine, width }] of scenarios.entries()) {
          await progress("browser_starting", name, width);
          const current = { ...fixture, applicants: fixture.applicants.slice(scenarioIndex * VALIDATION.participantsPerScenario, (scenarioIndex + 1) * VALIDATION.participantsPerScenario) };
          const browser = await engine.launch({ headless: false, ...(name === "chromium" ? { args: ["--force-renderer-accessibility", "--disable-features=Translate"] } : {}) });
          try {
            const applicant = await browser.newContext({ viewport: { width, height: ADMISSION_READER_PROBE.height }, reducedMotion: "reduce", locale: ADMISSION_READER_PROBE.locale });
            const rows = await submitAdmissionBatchBrowserRows(applicant, current, origin, secret);
            await progress("requests_prepared", name, width);
            await applicant.clearCookies();
            await bindAdmissionBatchBrowserSession(applicant, current.applicants[0].identity, origin, secret);
            const page = await applicant.newPage(); page.setDefaultTimeout(VALIDATION.pageTimeoutMs);
            await runPrivateBrowserRequest("open_reader_own_request", () => page.goto(origin + buildOwnAdmissionRequestRoute(fixture.slug, rows[0].requestId), { waitUntil: "networkidle" }));
            await reader.ready(page);
            await progress("public_confirmation_focus", name, width);
            const cancellation = page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel, exact: true });
            await reader.focus(page, cancellation, ADMISSION_UI_COPY.confirmCancel);
            await reader.activate(page); await expectBrowser(cancellation).toBeChecked();
            await progress("public_cancel_focus", name, width);
            await reader.focus(page, page.getByRole("button", { name: ADMISSION_UI_COPY.cancel, exact: true }), ADMISSION_UI_COPY.cancel);
            await progress("public_cancel_announcement", name, width);
            const publicOutput = await reader.activateAndHear(page, ADMISSION_UI_COPY.cancelled);
            await progress("public_cancel_announced", name, width);
            await expectBrowser(page.getByRole("region", { name: "Estado de tu solicitud", exact: true }).getByText(ADMISSION_UI_COPY.cancelled, { exact: true })).toBeVisible();
            await page.screenshot({ path: join(root, `${name}-${width}-public.png`) });
            observations.push({ engine: name, width, surface: "public", ...publicOutput });
            await writeFile(join(root, "observations.json"), JSON.stringify({ observations, realMessages: 0 }, null, 2) + "\n");
            await applicant.close();

            const reviewer = await browser.newContext({ viewport: { width, height: ADMISSION_READER_PROBE.height }, reducedMotion: "reduce", locale: ADMISSION_READER_PROBE.locale });
            await bindAdmissionBatchBrowserSession(reviewer, fixture.guardian, origin, secret);
            const review = await reviewer.newPage(); review.setDefaultTimeout(VALIDATION.pageTimeoutMs);
            await runPrivateBrowserRequest("open_reader_review", () => review.goto(origin + buildAdmissionReviewRoute(fixture.slug, rows[1].requestId), { waitUntil: "networkidle" }));
            await reader.ready(review);
            await progress("administrative_reason_focus", name, width);
            const reason = review.getByRole("textbox", { name: ADMISSION_REVIEW_UI_COPY.internalReason, exact: true });
            await reader.focus(review, reason, ADMISSION_REVIEW_UI_COPY.internalReason);
            await reader.type(review, VALIDATION.internalReason);
            await progress("administrative_confirmation_focus", name, width);
            const confirmation = review.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm, exact: true });
            await reader.focus(review, confirmation, ADMISSION_REVIEW_UI_COPY.confirm);
            await reader.activate(review); await expectBrowser(confirmation).toBeChecked();
            await progress("administrative_approve_focus", name, width);
            await reader.focus(review, review.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve, exact: true }), ADMISSION_REVIEW_UI_COPY.approve);
            await progress("administrative_approve_announcement", name, width);
            const reviewOutput = await reader.activateAndHear(review, ADMISSION_REVIEW_UI_COPY.complete);
            await progress("administrative_approve_announced", name, width);
            await expectBrowser(review.getByRole("main").getByRole("status").filter({ hasText: ADMISSION_REVIEW_UI_COPY.complete })).toBeVisible();
            await review.screenshot({ path: join(root, `${name}-${width}-administrative.png`) });
            observations.push({ engine: name, width, surface: "administrative", ...reviewOutput });
            await writeFile(join(root, "observations.json"), JSON.stringify({ observations, realMessages: 0 }, null, 2) + "\n");
            await reviewer.close();

            const facts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select
              (select status from public.academy_admission_requests where id=${rows[0].requestId}) as public_status,
              (select status from public.academy_admission_requests where id=${rows[1].requestId}) as review_status,
              (select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${current.applicants[1].identity.userId} and role='tribemate' and status='active') as basic_members,
              (select count(*)::integer from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
            expect(facts).toEqual({ public_status: "cancelled", review_status: "approved", basic_members: 1, deliveries: 0 });
            await progress("effects_confirmed", name, width);
            await writeFile(join(root, "observations.json"), JSON.stringify({ observations, realMessages: 0 }, null, 2) + "\n");
          } catch (error) {
            const code = error instanceof Error && Object.values(ADMISSION_READER_PROBE.failures).includes(error.message) ? error.message : ADMISSION_READER_PROBE.failures.journey;
            // A closed browser must retain its original failure even when its DOM is no longer observable.
            const interfaces = await Promise.all(browser.contexts().flatMap((context) => context.pages()).map(async (page) => ({
              cancellationMessages: await page.getByText(ADMISSION_UI_COPY.cancelled, { exact: true }).count(),
              ownedCancellationMessages: await page.getByRole("region", { name: "Estado de tu solicitud", exact: true }).getByText(ADMISSION_UI_COPY.cancelled, { exact: true }).count(),
              approvalMessages: await page.getByRole("main").getByRole("status").filter({ hasText: ADMISSION_REVIEW_UI_COPY.complete }).count(),
              busyMainRegions: await page.locator('main[aria-busy="true"]').count(),
            }))).catch(() => null);
            failures.push({ ...latestMilestone, code, interfaces, interfaceObservationUnavailable: interfaces === null });
            await writeFile(join(root, "failures.json"), JSON.stringify(failures, null, 2) + "\n");
          } finally { await browser.close(); }
        }
        expect(failures).toEqual([]);
      }, { messagingSecurity }));
    }, { authorization, ownershipNonce, databaseSelection: { databaseName: VALIDATION.databaseName, roleName: VALIDATION.roleName } });
  }, VALIDATION.timeoutMs);
});
