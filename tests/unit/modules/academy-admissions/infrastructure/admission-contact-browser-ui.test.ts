/** @vitest-environment node */
/** Exercises the actual applicant UI, native cookies, SQL/crypto and SDK with closed provider transport across both browser engines. @module admission-contact-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { enterAdmissionVerificationCode } from "@/tests/support/admission-contact-browser-actions";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native applicant contact UI", () => {
  it.each([{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }])("should recover one lost code response and present a verified pending on $name at $width", async ({ name, engine, width }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-contact-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) }, config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionContactVerification(database, false, config), slug = `issue-${fixture.context.tribeId}`;
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007004000_read_exact_own_admission_request.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261008230000_read_admission_contact_choices.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      let providerRequests = 0, receivedCode = "";
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
        const signedCookie = `${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`;
        await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(signedCookie), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
        const page = await context.newPage(), pageErrors: string[] = [];
        let verifyRequests = 0;
        const verifyStatuses: number[] = [];
        page.on("request", (request) => { if (new URL(request.url()).pathname.endsWith("/verify") && request.method() === "POST") verifyRequests += 1; });
        page.on("response", (response) => { if (new URL(response.url()).pathname.endsWith("/verify")) verifyStatuses.push(response.status()); });
        page.setDefaultTimeout(180_000); page.on("pageerror", () => pageErrors.push("pageerror"));
        let loseIssue = true;
        const forbidden = [fixture.context.userId, fixture.sessionToken, fixture.fixture.credential, fixture.own.email, secret];
        try {
          await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "domcontentloaded" });
          const confirmation = page.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
          await confirmation.waitFor({ state: "visible" });
          await page.waitForFunction(() => Array.from(document.querySelectorAll('section[aria-labelledby][aria-busy] button[role="checkbox"]')).some((element) => !element.hasAttribute("disabled")));

          expect(providerRequests).toBe(0);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "contact-before-code", forbidden, "contact-verification-captures.json", { selector: 'section[aria-labelledby][aria-busy]' });
          await page.route(`**/api/tribes/${slug}/admissions/challenges`, async (route) => { if (loseIssue && route.request().method() === "POST") { loseIssue = false; try { await route.fetch({ timeout: 180_000 }); } catch { await route.abort().catch(() => {}); return; } await route.fulfill({ status: 502, contentType: "application/json", body: "{}" }); } else await route.continue(); });
          await confirmation.click();
          await page.getByRole("button", { name: "Enviar código de ingreso", exact: true }).click();
          await page.getByRole("button", { name: "Consultar operación del código", exact: true }).waitFor({ state: "visible" });
          await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((element) => element.textContent === "Consultar operación del código" && !element.disabled));
          expect(receivedCode.length).toBe(6);
          expect(providerRequests).toBe(1);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "contact-response-lost", [...forbidden, receivedCode], "contact-verification-captures.json");
          await page.getByRole("button", { name: "Consultar operación del código", exact: true }).click();
          await page.getByLabel("Código de ingreso", { exact: true }).waitFor({ state: "visible" });
          await page.waitForFunction(() => Array.from(document.querySelectorAll('section[aria-labelledby][aria-busy]')).some((element) => element.querySelector('input[autocomplete="one-time-code"]') && element.getAttribute("aria-busy") === "false"));
          expect(providerRequests).toBe(1);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "contact-code-issued", [...forbidden, receivedCode], "contact-verification-captures.json", { selector: 'section[aria-labelledby][aria-busy]' });
          await enterAdmissionVerificationCode(page, receivedCode);
          await page.getByRole("button", { name: "Comprobar código", exact: true }).click();
          await page.waitForFunction(() => Boolean(Array.from(document.querySelectorAll('[role="status"]')).find((element) => element.textContent === "Código comprobado para este ingreso.")) || Array.from(document.querySelectorAll('[role="alert"]')).some((element) => element.textContent?.trim())).catch(async () => { const state = await page.evaluate(() => ({ hasCodeField: Boolean(document.querySelector('input[autocomplete="one-time-code"]')), busy: Array.from(document.querySelectorAll('section[aria-labelledby][aria-busy]')).map((element) => element.getAttribute("aria-busy")), alerts: document.querySelectorAll('[role="alert"]').length })); throw new Error(`Contact UI verification did not reach a public terminal state ${JSON.stringify({ verifyRequests, verifyStatuses, ...state })}`); });
          expect((await page.getByRole("alert").allTextContents()).filter((message) => message.trim())).toEqual([]);
          await page.getByText("Código comprobado para este ingreso.", { exact: true }).waitFor({ state: "visible" });
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "contact-code-verified", [...forbidden, receivedCode], "contact-verification-captures.json", { selector: 'section[aria-labelledby][aria-busy]' });
          await page.getByRole("checkbox", { name: "Confirmo que quiero solicitar ingreso a esta academia", exact: true }).click();
          await page.getByRole("button", { name: "Solicitar ingreso", exact: true }).click();
          await page.getByText("La solicitud está pendiente de revisión.", { exact: true }).waitFor({ state: "visible" });
          expect(providerRequests).toBe(1);
          expect(pageErrors).toEqual([]);
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "contact-initial-pending", [...forbidden, receivedCode], "contact-verification-captures.json");
          await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]); expect((await transaction.execute(sql`select status from public.academy_admission_verification_proofs where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ status: "applied" }]); });
          expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, events: 1, proofs: 1, memberships: 0 });
        } finally { await page.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); await browser.close(); }
      }, { preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], messagingSecurity, environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: fixture.fixture.emailSenderId, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.own.email, ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onProviderRequest: () => { providerRequests += 1; }, onDiagnosticCode: (code) => { receivedCode = code; } }));
    });
  }, 1_200_000);
});
