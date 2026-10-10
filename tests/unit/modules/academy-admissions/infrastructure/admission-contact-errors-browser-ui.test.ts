/** @vitest-environment node */
/** Exercises genuine quota rejection and provider unavailability with real route UI/auth/SQL/SDK. @module admission-contact-errors-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_COPY } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { MILLISECONDS_PER_SECOND, SECONDS_PER_MINUTE } from "@/src/constants/time";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native applicant contact errors", () => {
  it.each([{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }])("should preserve quota feedback and expose provider uncertainty without another send or false proof on $name at $width", async ({ engine, width }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-contact-errors-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionContactVerification(database, false, config), slug = `issue-${fixture.context.tribeId}`;
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007004000_read_exact_own_admission_request.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261008230000_read_admission_contact_choices.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      let providerRequests = 0;
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browserServer = await engine.launchServer({ headless: true });
        try {
          const browser = await engine.connect(browserServer.wsEndpoint()), context = await browser.newContext({ viewport: { width, height: 900 } });
          try {
            await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
            const page = await context.newPage();
            let issueRequests = 0, resendRequests = 0, pageErrors = 0, serverComponentRequests = 0, documentNavigations = 0;
            const issueStatuses: number[] = [];
            page.setDefaultTimeout(180_000);
            page.on("pageerror", () => pageErrors++);
            page.on("response", (response) => { if (response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/challenges")) issueStatuses.push(response.status()); });
            page.on("request", (request) => {
              if (request.resourceType() === "document") documentNavigations++;
              if (request.headers().rsc === "1") serverComponentRequests++;
              if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/challenges")) issueRequests++;
              if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/resend")) resendRequests++;
            });
            await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "domcontentloaded" });
            const consent = page.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
            await expect.poll(() => consent.isEnabled(), { timeout: 180_000 }).toBe(true);
            expect(providerRequests).toBe(0);
            await consent.click();
            await page.getByRole("button", { name: "Enviar código de ingreso", exact: true }).click();
            const quotaError = page.getByText("Se alcanzó el límite de nuevos envíos. Podés validar un código vigente o consultar tu solicitud.", { exact: true });
            await quotaError.waitFor({ state: "visible" }).catch(async () => {
              const state = await page.evaluate((catalogue) => {
                const text = document.body.textContent ?? "";
                return { publicCodes: catalogue.filter(([, message]) => text.includes(message)).map(([code]) => code), busy: Array.from(document.querySelectorAll('[aria-busy]')).map((element) => element.getAttribute("aria-busy")), hasCode: Boolean(document.querySelector('input[autocomplete="one-time-code"]')) };
              }, [...Object.entries(ADMISSION_ERROR_MESSAGE), ...Object.entries(ADMISSION_CONTACT_COPY).map(([code, message]) => [`contact_${code}`, message])]);
              throw new Error(`Native quota feedback unavailable ${JSON.stringify({ issueRequests, issueStatuses, providerRequests, pageErrors, effects: await fixture.counts(), ...state })}`);
            });
            expect(issueRequests).toBe(1);
            expect(providerRequests).toBe(0);
            expect(await page.getByLabel("Código de ingreso", { exact: true }).isEnabled()).toBe(true);
            expect(await page.getByRole("button", { name: "Solicitar ingreso", exact: true }).count()).toBe(0);
            expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, proofs: 0, events: 1, memberships: 0 });
            const forbidden = [fixture.context.userId, fixture.sessionToken, fixture.fixture.credential, fixture.own.email, secret];
            if (engine === chromium && width === 1280) await captureAdmissionReview(page, "contact-send-quota", forbidden, "contact-delivery-feedback-captures.json", { selector: 'section[aria-labelledby][aria-busy]' });

            // The send quota defers delivery rather than rejecting the code request; a replacement remains explicit.
            await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
            const resend = page.getByRole("button", { name: "Reenviar código", exact: true });
            await expect.poll(() => resend.isEnabled(), { timeout: ADMISSION_LIMIT.verificationResendWaitMs + MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE }).toBe(true);
            expect(resendRequests).toBe(0);
            await resend.click();
            await quotaError.waitFor({ state: "hidden" });
            await expect.poll(() => page.locator('section[aria-busy]').getAttribute("aria-busy"), { timeout: 180_000 }).toBe("false");
            const originalRead = page.getByRole("button", { name: "Consultar operación del código", exact: true });
            if (await originalRead.count() > 0) {
              await expect.poll(() => originalRead.isEnabled(), { timeout: 180_000 }).toBe(true);
              await originalRead.click();
            }
            // A 503 after the marker cannot prove non-delivery. Wait for the real receipt, then read it through UI.
            await expect.poll(async () => database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ state: string }>(sql`select state from public.message_deliveries where tribe_id=${fixture.context.tribeId} and actor_user_id=${fixture.context.userId} order by created_at desc limit 1`)).rows[0]?.state), { timeout: 180_000 }).toBe("unknown");
            expect(issueRequests).toBe(1);
            expect(resendRequests).toBe(1);
            expect(providerRequests).toBe(1);
            await page.getByRole("button", { name: "Consultar envío del código", exact: true }).click();
            await page.getByText("Entrega sin confirmar", { exact: true }).waitFor({ state: "visible" });
            await page.getByText("No pudimos confirmar el resultado del envío. Consultá su estado antes de repetir.", { exact: true }).waitFor({ state: "visible" });
            if (engine === chromium && width === 1280) await captureAdmissionReview(page, "contact-provider-unavailable", forbidden, "contact-delivery-feedback-captures.json", { selector: 'section[aria-labelledby][aria-busy]' });
            expect(await page.getByText("Código comprobado para este ingreso.", { exact: true }).count()).toBe(0);
            expect(await page.getByRole("button", { name: "Solicitar ingreso", exact: true }).count()).toBe(0);
            expect(await page.getByLabel("Código de ingreso", { exact: true }).isEnabled()).toBe(true);
            expect(await page.locator("body").textContent().then((text) => text?.includes("Synthetic private provider rejection"))).toBe(false);
            expect(providerRequests).toBe(1);
            expect(issueRequests).toBe(1);
            expect(resendRequests).toBe(1);
            expect(documentNavigations).toBe(1);
            expect(serverComponentRequests).toBe(0);
            expect(pageErrors).toBe(0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
            expect(await fixture.counts()).toMatchObject({ challenges: 2, deliveries: 2, proofs: 0, memberships: 0 });
          } finally { await context.close(); }
        } finally { await browserServer.kill(); }
      }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: fixture.fixture.emailSenderId, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.own.email, ADMISSION_TEST_ZAVU_TEST_MODE: "false", ADMISSION_TEST_ZAVU_STATUS: "503" }, onProviderRequest: () => { providerRequests++; } }));
    });
  }, 1_200_000);
});
