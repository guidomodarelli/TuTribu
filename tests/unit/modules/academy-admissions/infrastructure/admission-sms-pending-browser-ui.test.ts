/** @vitest-environment node */
/** Exercises explicit WhatsApp-to-SMS replacement and first proof attachment to an existing pending through real UI/auth/SQL/SDK. @module admission-sms-pending-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { enterAdmissionVerificationCode } from "@/tests/support/admission-contact-browser-actions";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { MILLISECONDS_PER_SECOND, SECONDS_PER_MINUTE } from "@/src/constants/time";
import { ADMISSION_CONTACT_COPY } from "@/src/modules/academy-admissions/constants/admission-contact-browser";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native SMS pending attachment", () => {
  it.each([{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }])("should explicitly replace WhatsApp with SMS and attach its proof to the same pending on $name at $width", async ({ engine, width }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange a real no-contact pending with its original submission clock.
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-sms-pending-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionContactVerification(database, false, config, true), pendingId = randomUUID(), slug = `issue-${fixture.context.tribeId}`;
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007004000_read_exact_own_admission_request.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261008230000_read_admission_contact_choices.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel='whatsapp',allow_sms_alternative=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${pendingId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '1 day',now+interval '29 days' from instant`);
      });
      const originalDates = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at from public.academy_admission_requests where id=${pendingId}`)).rows[0]);
      let providerRequests = 0, receivedCode = "";
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browserServer = await engine.launchServer({ headless: true });
        try {
        const browser = await engine.connect(browserServer.wsEndpoint());
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        try {
        await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
        const page = await context.newPage();
        let pageErrors = 0, issueRequests = 0, resendRequests = 0, applyRequests = 0, submitRequests = 0, documentNavigations = 0, serverComponentRequests = 0;
        page.setDefaultTimeout(180_000);
        page.on("pageerror", () => pageErrors++);
        page.on("request", (request) => {
          if (request.resourceType() === "document") documentNavigations++;
          if (request.headers().rsc === "1") serverComponentRequests++;
          if (request.method() !== "POST") return;
          const path = new URL(request.url()).pathname;
          if (path.endsWith("/challenges")) issueRequests++;
          else if (path.endsWith("/resend")) resendRequests++;
          else if (path.endsWith("/proof")) applyRequests++;
          else if (path.endsWith("/requests")) submitRequests++;
        });
          await page.goto(`${origin}/admissions/requests/${pendingId}?tribe=${slug}`, { waitUntil: "domcontentloaded" });
          const consent = page.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
          await expect.poll(() => consent.isEnabled(), { timeout: 180_000 }).toBe(true);
          expect(providerRequests).toBe(0);
          expect(submitRequests).toBe(0);
          await page.getByLabel("Teléfono para este ingreso", { exact: true }).fill(fixture.input.contact.value).catch(() => { throw new Error("Native pending phone input was unavailable"); });
          await page.getByRole("combobox", { name: "País del teléfono", exact: true }).click();
          await page.getByRole("option", { name: "AR", exact: true }).click();
          await consent.click();
          await page.getByRole("button", { name: "Enviar código de ingreso", exact: true }).click();
          await page.waitForFunction(() => Boolean(document.querySelector('input[autocomplete="one-time-code"]')) || Array.from(document.querySelectorAll('[role="alert"]')).some((element) => element.textContent?.trim()));
          if (await page.getByLabel("Código de ingreso", { exact: true }).count() === 0 && await page.getByText(ADMISSION_CONTACT_COPY.uncertain, { exact: true }).count() > 0) {
            // Recover the actual completed original after browser transport uncertainty, without repeating its POST.
            expect(issueRequests).toBe(1);
            const originalRead = page.getByRole("button", { name: "Consultar operación del código", exact: true });
            await expect.poll(() => originalRead.isEnabled(), { timeout: 180_000 }).toBe(true);
            await originalRead.click();
          }
          await page.getByLabel("Código de ingreso", { exact: true }).waitFor({ state: "visible" });
          await expect.poll(() => /^\d{6}$/u.test(receivedCode), { timeout: 180_000 }).toBe(true);
          expect(providerRequests).toBe(1);
          expect(issueRequests).toBe(1);
          const alternative = page.getByRole("button", { name: "Usar SMS para el mismo teléfono", exact: true });
          await alternative.waitFor({ state: "visible" });
          const cooldown = ADMISSION_LIMIT.verificationResendWaitMs + MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
          await expect.poll(() => alternative.isEnabled(), { timeout: cooldown }).toBe(true);
          expect(resendRequests).toBe(0);
          await alternative.click();
          await expect.poll(() => providerRequests, { timeout: 180_000 }).toBe(2);
          await expect.poll(() => page.locator('section[aria-busy]').getAttribute("aria-busy"), { timeout: 180_000 }).toBe("false");
          const replacementRead = page.getByRole("button", { name: "Consultar operación del código", exact: true });
          if (await replacementRead.count() > 0) {
            // The replacement may commit before its browser response settles; recover the same original once.
            await expect.poll(() => replacementRead.isEnabled(), { timeout: 180_000 }).toBe(true);
            await replacementRead.click();
            await replacementRead.waitFor({ state: "hidden" });
          }
          expect(resendRequests).toBe(1);
          expect(await page.getByLabel("Código de ingreso", { exact: true }).inputValue() === "").toBe(true);
          expect(await page.getByLabel("Teléfono para este ingreso", { exact: true }).isDisabled()).toBe(true);
          expect(await page.getByLabel("Teléfono para este ingreso", { exact: true }).inputValue() === fixture.input.contact.value).toBe(true);
          await database.withContext(fixture.own, async (transaction) => {
            const lineage = (await transaction.execute(sql`select channel,state,is_current,normalized_contact=${fixture.input.contact.value} as same_contact from public.contact_verification_challenges where user_id=${fixture.context.userId} and tribe_id=${fixture.context.tribeId} order by created_at`)).rows;
            expect(lineage).toEqual([{ channel: "whatsapp", state: "invalidated", is_current: false, same_contact: true }, { channel: "sms", state: "issued", is_current: true, same_contact: true }]);
          });

          // A valid code remains local even when further sends are unavailable.
          await database.withContext(fixture.fixture.own, async (transaction) => {
            await transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${fixture.context.tribeId}`);
            await transaction.execute(sql`update public.tenant_messaging_connections set state='suspended',state_reason='security_pause',version=version+1 where id=${fixture.fixture.scope.connectionId}`);
          });
          const wrongCode = receivedCode === "000000" ? "111111" : "000000";
          await enterAdmissionVerificationCode(page, wrongCode);
          await page.getByRole("button", { name: "Comprobar código", exact: true }).click();
          await page.getByText("El código no es correcto. Revisalo antes de intentar otra vez.", { exact: true }).waitFor({ state: "visible" });
          expect(await page.getByText("Código comprobado para este ingreso.", { exact: true }).count()).toBe(0);
          await enterAdmissionVerificationCode(page, receivedCode);
          expect(await page.getByText("El código no es correcto. Revisalo antes de intentar otra vez.", { exact: true }).count()).toBe(0);
          await page.getByRole("button", { name: "Comprobar código", exact: true }).click();
          await page.getByText("Código comprobado para este ingreso.", { exact: true }).waitFor({ state: "visible" });
          await page.getByRole("button", { name: "Aplicar prueba a esta solicitud", exact: true }).click();
          await page.getByText("La prueba quedó aplicada a tu solicitud pendiente.", { exact: true }).waitFor({ state: "visible" });
          await page.getByRole("heading", { name: "Comprobar contacto para el ingreso", exact: true }).waitFor({ state: "hidden" });
          expect(applyRequests).toBe(1);
          expect(submitRequests).toBe(0);
          expect(issueRequests).toBe(1);
          expect(resendRequests).toBe(1);
          expect(providerRequests).toBe(2);
          expect(documentNavigations).toBe(1);
          expect(serverComponentRequests).toBe(0);
          expect(pageErrors).toBe(0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
          await database.withContext(fixture.own, async (transaction) => {
            const pending = (await transaction.execute(sql`select id,status,version,submitted_at,expires_at,evidence_source,contact_type,normalized_contact=${fixture.input.contact.value} as same_contact from public.academy_admission_requests where id=${pendingId}`)).rows[0];
            expect(pending).toEqual({ id: pendingId, status: "pending", version: 2, ...originalDates, evidence_source: "local", contact_type: "phone", same_contact: true });
            expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
            expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where resource_id=${pendingId} and event_type='proof_attached'`)).rows).toEqual([{ count: 1 }]);
            expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ status: "applied", applied_request_id: pendingId }]);
          });
          expect(await fixture.counts()).toMatchObject({ challenges: 2, deliveries: 2, proofs: 1, memberships: 0 });
        } finally { await context.close(); }
        } finally { await browserServer.kill(); }
      }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-admission-phone-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.input.contact.value, ADMISSION_TEST_ZAVU_WHATSAPP_SENDER: "synthetic-whatsapp-sender", ADMISSION_TEST_ZAVU_SMS_SENDER: "synthetic-sms-sender", ADMISSION_TEST_ZAVU_TEMPLATE_ID: "synthetic-otp-template" }, onProviderRequest: () => { providerRequests++; }, onDiagnosticCode: (code) => { receivedCode = code; } }));
    });
  }, 1_200_000);
});
