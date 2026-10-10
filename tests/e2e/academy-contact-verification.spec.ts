/** Exercises terminal local-code failure and explicit replacement through real UI/auth/SQL/SDK. @module academy-contact-verification-e2e */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { enterAdmissionVerificationCode } from "@/tests/support/admission-contact-browser-actions";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_CONTACT_BROWSER_TIMEOUT_MS } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

test("should retain a confirmed terminal challenge failure until an explicit replacement is committed", async ({ page, context }) => {
  test.setTimeout(ADMISSION_LIMIT.verificationProofFreshnessMs);
  page.setDefaultTimeout(ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
  await withAcademyAdmissionDatabase(async (database) => {
    const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => {
      const id = randomUUID();
      return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }];
    }));
    const messagingSecurity = { environment: "synthetic-contact-terminal-e2e", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
    const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
    const fixture = await prepareAdmissionContactVerification(database, false, config), slug = `issue-${fixture.context.tribeId}`;
    for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007004000_read_exact_own_admission_request.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261008230000_read_admission_contact_choices.sql"]) await database.applyMigration(migration);
    await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
    let providerRequests = 0, receivedCode = "";
    await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
      await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
      let issueRequests = 0, verifyRequests = 0, resendRequests = 0, documentRequests = 0, serverComponentRequests = 0, pageErrors = 0;
      page.on("pageerror", () => pageErrors++);
      page.on("request", (request) => {
        if (request.resourceType() === "document") documentRequests++;
        if (request.headers().rsc === "1") serverComponentRequests++;
        if (request.method() !== "POST") return;
        const path = new URL(request.url()).pathname;
        if (path.endsWith("/challenges")) issueRequests++;
        if (path.endsWith("/verify")) verifyRequests++;
        if (path.endsWith("/resend")) resendRequests++;
      });
      await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "domcontentloaded" });
      const consent = page.getByRole("checkbox", { name: "Confirmo el contacto y el envío del código para este ingreso.", exact: true });
      await expect(consent).toBeEnabled({ timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
      await expect(page.getByRole("button", { name: "Enviar código de ingreso", exact: true })).toBeDisabled();
      expect(providerRequests).toBe(0);
      await consent.click();
      await page.getByRole("button", { name: "Enviar código de ingreso", exact: true }).click();

      /** Reconciles only an existing original when the browser response was uncertain, without another POST. */
      const settleOriginal = async () => {
        await expect(page.locator('section[aria-labelledby][aria-busy]').filter({ has: page.getByRole("heading", { name: "Comprobar contacto para el ingreso", exact: true }) })).toHaveAttribute("aria-busy", "false", { timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
        const readOriginal = page.getByRole("button", { name: "Consultar operación del código", exact: true });
        if (await readOriginal.count() > 0) {
          await expect(readOriginal).toBeEnabled({ timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
          await readOriginal.click();
          await expect(page.locator('section[aria-labelledby][aria-busy]').filter({ has: page.getByRole("heading", { name: "Comprobar contacto para el ingreso", exact: true }) })).toHaveAttribute("aria-busy", "false", { timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
        }
      };
      await settleOriginal();
      const codeInput = page.getByLabel("Código de ingreso", { exact: true }), verify = page.getByRole("button", { name: "Comprobar código", exact: true });
      await expect(codeInput).toBeEnabled();
      await expect.poll(() => receivedCode.length, { timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS }).toBe(ADMISSION_LIMIT.verificationCodeDigits);
      expect(issueRequests).toBe(1);
      expect(providerRequests).toBe(1);
      expect(await page.locator("body").textContent().then((text) => text?.includes(fixture.own.email))).toBe(false);
      await expect(page.getByText("Estado del envío", { exact: true })).toBeVisible();
      const wrongCode = receivedCode === "000000" ? "000001" : "000000";
      for (let attempt = 0; attempt < ADMISSION_LIMIT.verificationChallengeFailureCount; attempt++) {
        await enterAdmissionVerificationCode(page, wrongCode);
        await verify.click();
        await settleOriginal();
        await expect(page.getByText("El código no es correcto. Revisalo antes de intentar otra vez.", { exact: true })).toBeVisible();
      }
      // The fifth wrong-code result records invalidation; the next own read confirms that terminal resource state.
      await enterAdmissionVerificationCode(page, receivedCode);
      await verify.click();
      await settleOriginal();
      const terminalFeedback = page.getByText("Alcanzaste el límite de intentos de verificación. Esperá antes de intentar otra vez.", { exact: true });
      await expect(terminalFeedback).toBeVisible();
      await expect(codeInput).toBeDisabled();
      await expect(verify).toBeDisabled();
      if (test.info().project.name === "chromium-desktop") await captureAdmissionReview(page, "contact-attempts-exhausted", [fixture.context.userId, fixture.sessionToken, fixture.fixture.credential, fixture.own.email, secret, receivedCode], "contact-terminal-feedback-captures.json", { selector: 'section[aria-labelledby][aria-busy]', omit: 'input[autocomplete="one-time-code"]' });
      expect(verifyRequests).toBe(ADMISSION_LIMIT.verificationChallengeFailureCount + 1);
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, proofs: 0, memberships: 0 });
      const resend = page.getByRole("button", { name: "Reenviar código", exact: true });
      await expect(resend).toBeEnabled({ timeout: ADMISSION_LIMIT.verificationResendWaitMs + ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
      expect(resendRequests).toBe(0);
      await resend.click();
      await settleOriginal();
      await expect(terminalFeedback).toBeHidden();
      await expect(codeInput).toBeEnabled();
      expect((await codeInput.inputValue()).length).toBe(0);
      await expect.poll(() => providerRequests, { timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS }).toBe(2);
      expect(issueRequests).toBe(1);
      expect(resendRequests).toBe(1);
      await enterAdmissionVerificationCode(page, receivedCode);
      await verify.click();
      await settleOriginal();
      await expect(page.getByText("Código comprobado para este ingreso.", { exact: true })).toBeVisible();
      expect(await fixture.counts()).toMatchObject({ challenges: 2, deliveries: 2, proofs: 1, memberships: 0 });
      const rows = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,failed_attempts,code_mac is null as material_removed from public.contact_verification_challenges where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId} order by created_at`)).rows);
      expect(rows).toEqual([{ state: "invalidated", failed_attempts: 5, material_removed: true }, { state: "verified", failed_attempts: 0, material_removed: true }]);
      expect(documentRequests).toBe(1);
      expect(serverComponentRequests).toBe(0);
      expect(pageErrors).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: fixture.fixture.emailSenderId, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.own.email, ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onProviderRequest: () => { providerRequests++; }, onDiagnosticCode: (code) => { receivedCode = code; } }));
  });
});
