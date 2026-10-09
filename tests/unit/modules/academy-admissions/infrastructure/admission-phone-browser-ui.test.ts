/** @vitest-environment node */
/** Exercises the real phone applicant UI and proof submission with native auth/SQL/SDK on Chromium and WebKit. @module admission-phone-browser-ui-tests */
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
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_COPY } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native applicant phone UI", () => {
  it.each((["sms", "whatsapp"] as const).flatMap((channel) => [{ channel, name: "chromium", engine: chromium, width: 1280 }, { channel, name: "chromium", engine: chromium, width: 390 }, { channel, name: "webkit", engine: webkit, width: 1280 }, { channel, name: "webkit", engine: webkit, width: 390 }]))("should present a phone request after a locally verified $channel code on $name at $width", async ({ channel, engine, width }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-phone-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionContactVerification(database, false, config, true), slug = `issue-${fixture.context.tribeId}`;
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007004000_read_exact_own_admission_request.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261008230000_read_admission_contact_choices.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        if (channel === "whatsapp") await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel=${channel},verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      let providerRequests = 0, receivedCode = "";
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
        const page = await context.newPage(), pageErrors: string[] = [], issueStatuses: number[] = [], viewerStatuses: number[] = [], issueFailures: string[] = [];
        let issueRequests = 0, issueStartedAt = 0, issueFailedAfterMs = 0;
        page.setDefaultTimeout(180_000); page.on("pageerror", () => pageErrors.push("pageerror"));
        page.on("response", (response) => { if (response.request().method() === "POST" && response.url() === `${origin}/api/tribes/${slug}/admissions/challenges`) issueStatuses.push(response.status()); if (response.url().startsWith(`${origin}/api/auth/get-session`)) viewerStatuses.push(response.status()); });
        page.on("request", (request) => { if (request.method() === "POST" && request.url() === `${origin}/api/tribes/${slug}/admissions/challenges`) { issueRequests += 1; issueStartedAt = Date.now(); } });
        page.on("requestfailed", (request) => { if (request.method() === "POST" && request.url() === `${origin}/api/tribes/${slug}/admissions/challenges`) { issueFailedAfterMs = Date.now() - issueStartedAt; const failure = request.failure()?.errorText ?? ""; issueFailures.push(/cancel|abort/iu.test(failure) ? "aborted" : /cors|access control/iu.test(failure) ? "cors" : /timeout/iu.test(failure) ? "timeout" : /connection/iu.test(failure) ? "connection" : "other"); } });
        try {
          await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "domcontentloaded" });
          await page.getByLabel("Teléfono para este ingreso", { exact: true }).waitFor({ state: "visible" });
          await page.waitForFunction(() => Array.from(document.querySelectorAll('section[aria-labelledby][aria-busy] button[role="checkbox"]')).some((element) => !element.hasAttribute("disabled")));
          expect(providerRequests).toBe(0);
          await page.getByLabel("Teléfono para este ingreso", { exact: true }).fill(fixture.input.contact.value).catch(() => { throw new Error("Native phone contact entry was unavailable"); });
          await page.getByRole("combobox", { name: "País del teléfono", exact: true }).click();
          await page.getByRole("option", { name: "AR", exact: true }).click();
          await page.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }).click();
          await page.getByRole("button", { name: "Enviar código de ingreso", exact: true }).click();
          await page.waitForFunction(() => Boolean(document.querySelector('input[autocomplete="one-time-code"]')) || Array.from(document.querySelectorAll('[role="alert"]')).some((element) => element.textContent?.trim()) || Boolean(document.querySelector('[aria-invalid="true"]'))).catch(() => {});
          if (await page.getByLabel("Código de ingreso", { exact: true }).count() === 0 && await page.getByText(ADMISSION_CONTACT_COPY.uncertain, { exact: true }).count() > 0) {
            // Native WebKit can time out before the remote SQL fixture's focal dispatch finishes.
            // Recover the real original with an explicit GET, retaining its one POST and private delivery.
            expect(issueRequests).toBe(1);
            await page.getByRole("button", { name: "Consultar operación del código", exact: true }).click();
            await page.getByLabel("Código de ingreso", { exact: true }).waitFor({ state: "visible" });
            expect(issueRequests).toBe(1);
          }
          if (await page.getByLabel("Código de ingreso", { exact: true }).count() === 0) {
            const state = await page.evaluate(({ phone, catalogue }) => {
              const section = Array.from(document.querySelectorAll('section[aria-labelledby][aria-busy]')).find((element) => element.querySelector('input[type="tel"]'));
              const input = section?.querySelector<HTMLInputElement>('input[type="tel"]');
              const alerts = Array.from(document.querySelectorAll('[role="alert"]')).map((element) => element.textContent?.trim()).filter(Boolean);
              return { phoneMatches: input?.value === phone, countrySelected: section?.querySelector('[role="combobox"]')?.textContent === "AR", confirmed: section?.querySelector('[role="checkbox"]')?.getAttribute("aria-checked") === "true", phoneInvalid: input?.getAttribute("aria-invalid") === "true", countryInvalid: section?.querySelector('[role="combobox"]')?.getAttribute("aria-invalid") === "true", busy: section?.getAttribute("aria-busy"), invalidInputs: Array.from(document.querySelectorAll<HTMLInputElement>("input")).filter((element) => !element.validity.valid).length, alerts: alerts.length, publicCodes: catalogue.filter(([, message]) => alerts.includes(message)).map(([key]) => key) };
            }, { phone: fixture.input.contact.value, catalogue: [...Object.entries(ADMISSION_ERROR_MESSAGE), ...Object.entries(ADMISSION_CONTACT_COPY).map(([key, message]) => [`contact_${key}`, message]), ...Object.entries(ADMISSION_UI_COPY).map(([key, message]) => [`ui_${key}`, message])] });
            const effects = await fixture.counts();
            throw new Error(`Native phone challenge unavailable ${JSON.stringify({ issueRequests, issueFailedAfterMs, issueFailures, issueStatuses, viewerStatuses, providerRequests, effects, pageErrors: pageErrors.length, ...state })}`);
          }
          await page.waitForFunction(() => Array.from(document.querySelectorAll('section[aria-labelledby][aria-busy]')).some((element) => element.querySelector('input[autocomplete="one-time-code"]') && element.getAttribute("aria-busy") === "false"));
          await expect.poll(() => /^\d{6}$/u.test(receivedCode), { timeout: 180_000 }).toBe(true);
          expect(providerRequests).toBe(1);
          expect(/^\d{6}$/u.test(receivedCode)).toBe(true);
          expect(await page.getByLabel("Teléfono para este ingreso").isDisabled()).toBe(true);
          await enterAdmissionVerificationCode(page, receivedCode);
          await page.getByRole("button", { name: "Comprobar código", exact: true }).click();
          await page.getByText("Código comprobado para este ingreso.", { exact: true }).waitFor({ state: "visible" });
          expect(await page.getByLabel("Teléfono", { exact: true }).isDisabled()).toBe(true);
          await page.getByRole("checkbox", { name: "Confirmo que quiero solicitar ingreso a esta academia", exact: true }).click();
          await page.getByRole("button", { name: "Solicitar ingreso", exact: true }).click();
          await page.getByText("La solicitud está pendiente de revisión.", { exact: true }).waitFor({ state: "visible" });
          expect(providerRequests).toBe(1);
          expect(issueRequests).toBe(1);
          expect(pageErrors).toEqual([]);
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
          expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, events: 1, proofs: 1, memberships: 0 });
          await database.withContext(fixture.own, async (transaction) => {
            expect((await transaction.execute(sql`select status from public.academy_admission_verification_proofs where user_id=${fixture.context.userId} and tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ status: "applied" }]);
            expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where user_id=${fixture.context.userId} and tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ count: 1 }]);
          });
        } finally { await context.close(); await browser.close(); }
      }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: channel === "sms" ? "synthetic-sms-sender" : "synthetic-whatsapp-sender", ADMISSION_TEST_ZAVU_RECIPIENT: fixture.input.contact.value, ADMISSION_TEST_ZAVU_DIAGNOSTIC_CHANNEL: channel, ADMISSION_TEST_ZAVU_TEMPLATE_ID: "synthetic-otp-template", ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onProviderRequest: () => { providerRequests += 1; }, onDiagnosticCode: (code) => { receivedCode = code; } }));
    });
  }, 1_200_000);
});
