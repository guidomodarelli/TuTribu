/** @vitest-environment node */
/** Exercises authoritative pending age through actual Next, PostgreSQL and both browser engines. @module admission-pending-age-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium, webkit, expect as playwrightExpect } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionReviewHistoryDatabase } from "@/tests/support/admission-review-history-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { ADMISSION_ACTIVITY_VALIDATION as BROWSER } from "@/tests/support/constants/admission-activity-validation";
import { ADMISSION_REVIEW_BROWSER_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-review-validation";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_REVIEW_FILTER_COPY } from "@/src/modules/academy-admissions/constants/admission-review-filters";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native pending age highlight", () => {
  it("should preserve the authoritative age highlight through SSR, detail, decision and reload in both engines and widths", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-pending-age", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const security = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionReviewHistoryDatabase(database, security);
      const scenarios = [
        { engine: chromium, name: "chromium", width: 1280 }, { engine: chromium, name: "chromium", width: 390 },
        { engine: webkit, name: "webkit", width: 1280 }, { engine: webkit, name: "webkit", width: 390 },
      ].map((scenario, index) => ({ ...scenario, search: `Persona de ejemplo ${index + 1}`, oldId: randomUUID(), oldUserId: randomUUID(), freshId: randomUUID(), freshUserId: randomUUID() }));
      await database.withContext(fixture.own, async (transaction) => {
        for (const [index, scenario] of scenarios.entries()) {
          for (const [userId, id, suffix, days] of [[scenario.oldUserId, scenario.oldId, "antigua", 4], [scenario.freshUserId, scenario.freshId, "reciente", 0]] as const) {
            const email = `persona-${index + 1}-${suffix}@example.test`;
            await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},${`${scenario.search} ${suffix}`},${email},false,clock_timestamp(),clock_timestamp())`);
            await transaction.execute(sql`with instant as (select clock_timestamp()-${days}*interval '1 day' as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) select ${id},${fixture.tribeId},${userId},'common','email',${email},'declared',original_policy_snapshot,instant.now,instant.now+interval '30 days' from public.academy_admission_requests cross join instant where id=${fixture.admissionRequestId}`);
          }
        }
      });
      const artifacts = process.env[VALIDATION.artifactEnvironment] ?? join(process.cwd(), "test-results", "admission-pending-age");
      await mkdir(artifacts, { recursive: true });
      const proofs: Array<{ engine: string; width: number; writes: number; documentLoads: number; errors: string[]; overflow: number }> = [];
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        const expectBrowser = playwrightExpect.configure({ timeout: BROWSER.browserTimeoutMs });
        for (const scenario of scenarios) {
          const browser = await scenario.engine.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width: scenario.width, height: BROWSER.height }, reducedMotion: "reduce" });
            const value = encodeURIComponent(`${fixture.guardian.sessionToken}.${await makeSignature(fixture.guardian.sessionToken, secret)}`);
            await runPrivateBrowserRequest("bind_pending_age_session", () => context.addCookies([{ name: "better-auth.session_token", value, url: origin, httpOnly: true, sameSite: "Lax" }]));
            const page = await context.newPage();
            page.setDefaultTimeout(BROWSER.browserTimeoutMs);
            const errors: string[] = [];
            let writes = 0, documentLoads = 0;
            page.on("pageerror", (error) => errors.push(error.name));
            page.on("console", (message) => { if (message.type() === "error" && /hydration|hydrated|server rendered/i.test(message.text())) errors.push("hydration_error"); });
            page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads += 1; if (request.method() === "POST" && new URL(request.url()).pathname.includes("/admissions/")) writes += 1; });
            const query = new URLSearchParams({ status: "all", search: scenario.search });
            const url = `${origin}/${fixture.slug}/academia/admissions?${query}`;
            const response = await runPrivateBrowserRequest("open_pending_age_inbox", () => page.goto(url, { waitUntil: "domcontentloaded" }));
            expect(response?.status()).toBe(200);
            const serverHtml = await response!.text();
            expect(serverHtml).toContain("Pendiente hace tres días o más");
            await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true })).toBeEnabled();
            const oldRow = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `${scenario.search} antigua`, exact: true }) });
            const freshRow = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `${scenario.search} reciente`, exact: true }) });
            await expectBrowser(oldRow.getByText("Pendiente hace tres días o más", { exact: true })).toBeVisible();
            await expectBrowser(freshRow).toBeVisible();
            await expectBrowser(freshRow.getByText("Pendiente hace tres días o más", { exact: true })).toHaveCount(0);
            const capture = scenario.name === "chromium" && scenario.width === 1280;
            const forbidden = [secret, fixture.guardian.sessionToken, fixture.guardian.sessionId, fixture.guardian.userId, ...scenarios.flatMap((item) => [item.oldId, item.oldUserId, item.freshId, item.freshUserId])];
            if (capture) await captureAdmissionReview(page, "admission-pending-age-inbox", forbidden, VALIDATION.pendingAgeCaptureFile, { selector: '[class*="AdmissionReview__row"] > div:first-child' });
            await oldRow.getByRole("button", { name: `${ADMISSION_REVIEW_UI_COPY.detail}: ${scenario.search} antigua`, exact: true }).click();
            await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close, exact: true })).toBeEnabled();
            await expectBrowser(page.getByText("Pendiente hace tres días o más", { exact: true })).toBeVisible();
            if (capture) await captureAdmissionReview(page, "admission-pending-age-detail", forbidden, VALIDATION.pendingAgeCaptureFile, { selector: '[aria-label="Detalle de la solicitud"]' });
            await page.getByLabel(ADMISSION_REVIEW_UI_COPY.internalReason, { exact: true }).fill("Revisión de ejemplo completada");
            await page.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm, exact: true }).check();
            await page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve, exact: true }).click();
            await expectBrowser(page.getByText(ADMISSION_REVIEW_UI_COPY.complete, { exact: true })).toBeVisible();
            await expectBrowser(page.getByText("Pendiente hace tres días o más", { exact: true })).toHaveCount(0);
            await page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close, exact: true }).click();
            await expectBrowser(oldRow).toContainText("Aprobada");
            await expectBrowser(oldRow.getByText("Pendiente hace tres días o más", { exact: true })).toHaveCount(0);
            expect(writes).toBe(1);
            expect(documentLoads).toBe(1);
            await page.reload({ waitUntil: "domcontentloaded" });
            await expectBrowser(page.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply, exact: true })).toBeEnabled();
            await expectBrowser(oldRow).toContainText("Aprobada");
            await expectBrowser(page.getByText("Pendiente hace tres días o más", { exact: true })).toHaveCount(0);
            const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
            expect(overflow).toBe(0);
            expect(errors).toEqual([]);
            expect(documentLoads).toBe(2);
            proofs.push({ engine: scenario.name, width: scenario.width, writes, documentLoads, errors, overflow });
          } finally { await browser.close(); }
        }
      }, { messagingSecurity }));
      const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and id in (${sql.join(scenarios.map((item) => sql`${item.oldId}`), sql`,`)}) and status='approved') as approved`)).rows[0]);
      expect(effects).toEqual({ deliveries: 0, approved: 4 });
      await writeFile(join(artifacts, "pending-age-native-proof.json"), JSON.stringify({ at: new Date().toISOString(), proofs, effects, externalMessagesSent: 0 }, null, 2));
    });
  }, VALIDATION.testTimeoutMs);
});
