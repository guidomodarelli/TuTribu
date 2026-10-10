/** Exercises a genuine canceled request and fresh contact entry without losing earlier code references. @module academy-contact-same-retry-e2e */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_CONTACT_STORAGE_PREFIX, ADMISSION_CONTACT_BROWSER_TIMEOUT_MS } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";

test("should request a fresh code for the same contact after its own request was canceled", async ({ page, context }) => {
  test.setTimeout(ADMISSION_LIMIT.verificationProofFreshnessMs);
  page.setDefaultTimeout(ADMISSION_CONTACT_BROWSER_TIMEOUT_MS);
  await withAcademyAdmissionDatabase(async (database) => {
    const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
    const messagingSecurity = { environment: "synthetic-contact-retry", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
    const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
    const fixture = await prepareAdmissionContactVerification(database, false, config, true), slug = `issue-${fixture.context.tribeId}`, requestId = randomUUID(), issueOperationId = randomUUID();
    for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007004000_read_exact_own_admission_request.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261008230000_read_admission_contact_choices.sql"]) await database.applyMigration(migration);
    await database.withContext(fixture.fixture.own, async (transaction) => {
      await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
      await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
    });
    let providerRequests = 0, receivedCode = "";
    await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
      await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
      /** @param path - Own action path. @param data - Original synthetic proposal. @returns The native response without exposing cookie/body in request failure logs. */
      const post = async (path: string, data: unknown) => {
        try { return await context.request.post(`${origin}/api/tribes/${slug}/admissions${path}`, { headers: { origin }, data }); }
        catch { throw new Error("Contact retry request could not be observed"); }
      };
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${requestId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '2 days',now+interval '28 days' from instant`));
      const issued = await post("/challenges", { operationId: issueOperationId, confirmed: true, expectedPolicyVersion: 2, channel: "sms", phone: fixture.fixture.scope.contact.value, country: "AR", requestId });
      expect(issued.status()).toBe(201);
      const issuedBody = await issued.json();
      await expect.poll(() => receivedCode.length, { timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS }).toBe(ADMISSION_LIMIT.verificationCodeDigits);
      const verifiedOperationId = randomUUID();
      const verified = await post(`/challenges/${issuedBody.result.challengeId}/verify`, { operationId: verifiedOperationId, confirmed: true, verificationCode: receivedCode });
      expect(verified.status()).toBe(200);
      const verifiedBody = await verified.json();
      const applied = await post(`/requests/${requestId}/proof`, { operationId: randomUUID(), confirmed: true, expectedVersion: 1, proofId: verifiedBody.result.proofId });
      expect(applied.status()).toBe(200);
      const canceled = await post(`/requests/${requestId}/cancel`, { operationId: randomUUID(), confirmed: true, expectedVersion: 2 });
      expect(canceled.status()).toBe(200);
      const originalKey = `${ADMISSION_CONTACT_STORAGE_PREFIX}:${encodeURIComponent(fixture.context.userId)}:${encodeURIComponent(slug)}:`;
      const original = { viewerId: fixture.context.userId, slug, requestId: null, issuedOperationId: issueOperationId, verifiedOperationId, pending: null };
      await page.addInitScript(({ key, record }) => sessionStorage.setItem(key, JSON.stringify(record)), { key: originalKey, record: original });
      let originalReads = 0, admissionPostRequests = 0, errors = 0, resendRequests = 0, resendResponses = 0;
      page.on("pageerror", () => errors++);
      page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.includes("/admissions/operations/")) originalReads++; if (request.method() === "POST" && path.includes("/admissions/")) admissionPostRequests++; if (path.endsWith("/resend")) resendRequests++; });
      page.on("response", (response) => { if (new URL(response.url()).pathname.endsWith("/resend")) resendResponses++; });
      await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "domcontentloaded" });
      const phone = page.getByLabel("Teléfono para este ingreso", { exact: true });
      await expect(phone).toBeEnabled({ timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
      await expect(page.getByRole("checkbox", { name: "Confirmo el contacto y el envío del código para este ingreso.", exact: true })).not.toBeChecked();
      await expect(page.getByText("Código comprobado para este ingreso.", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Enviar código de ingreso", exact: true })).toBeDisabled();
      await phone.fill("+5491155505678");
      expect(await phone.inputValue() === "+5491155505678").toBe(true);
      expect(await page.evaluate((key) => sessionStorage.getItem(key) !== null, originalKey)).toBe(true);
      await phone.fill(fixture.fixture.scope.contact.value);
      await page.getByLabel("País del teléfono", { exact: true }).click();
      await page.getByRole("option", { name: "AR", exact: true }).click();
      await page.getByRole("checkbox", { name: "Confirmo el contacto y el envío del código para este ingreso.", exact: true }).click();
      const currentResponse = page.waitForResponse((candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname.endsWith("/challenges/current"));
      await page.getByRole("button", { name: "Enviar código de ingreso", exact: true }).click();
      expect((await currentResponse).status()).toBe(200);
      await expect(page.getByText("Ya hay un código para ese contacto. Confirmá el reenvío para reemplazarlo; la prueba anterior no se usa en esta presentación.", { exact: true })).toBeVisible({ timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
      await expect(page.getByLabel("Código de ingreso", { exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Comprobar código", exact: true })).toBeDisabled();
      await expect(page.getByRole("checkbox", { name: "Confirmo el contacto y el envío del código para este ingreso.", exact: true })).not.toBeChecked();
      expect(providerRequests).toBe(1);
      const privateValues = [fixture.context.userId, fixture.sessionToken, fixture.own.email, fixture.fixture.credential, fixture.fixture.scope.contact.value, secret, receivedCode];
      await captureAdmissionReview(page, "contact-retry-selected", privateValues, "contact-retry-captures.json", { selector: 'section[aria-labelledby][aria-busy]' });
      await page.getByRole("checkbox", { name: "Confirmo el contacto y el envío del código para este ingreso.", exact: true }).click();
      const response = page.waitForResponse((candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname.endsWith("/resend"));
      await page.getByRole("button", { name: "Reenviar código", exact: true }).click();
      let recoveredOriginal = false;
      try { expect((await response).status()).toBe(201); }
      catch {
        const pendingOperationId = await page.evaluate((prefix) => {
          for (let storageIndex = 0; storageIndex < sessionStorage.length; storageIndex++) {
            const key = sessionStorage.key(storageIndex);
            if (!key?.startsWith(prefix)) continue;
            const record = JSON.parse(sessionStorage.getItem(key) ?? "null");
            if (record?.pending?.kind === "resend") return record.pending.operationId as string;
          }
          return null;
        }, originalKey);
        let originalStatus: number | null = null, originalState: string | null = null, replacementChallengeId: string | null = null;
        if (pendingOperationId) {
          try {
            const originalResponse = await context.request.get(`${origin}/api/tribes/${slug}/admissions/operations/${pendingOperationId}`, { timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
            originalStatus = originalResponse.status();
            const parsed = admissionOperationRecoverySchema.safeParse(await originalResponse.json());
            originalState = parsed.success ? parsed.data.state : "unusable";
            if (parsed.success && parsed.data.state === "completed" && parsed.data.type === VERIFICATION_ISSUANCE_OPERATION.resend && "challengeId" in parsed.data.result) replacementChallengeId = parsed.data.result.challengeId;
          } catch { originalState = "unobserved"; }
        }
        expect(originalStatus).toBe(200);
        expect(originalState).toBe("completed");
        expect(replacementChallengeId !== null && replacementChallengeId !== issuedBody.result.challengeId).toBe(true);
        expect(resendRequests).toBe(1);
        expect(resendResponses).toBe(0);
        await expect(page.getByText("La respuesta no quedó confirmada. Consultá la operación original antes de repetir.", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Reenviar código", exact: true })).toBeDisabled();
        await page.getByRole("button", { name: "Consultar operación del código", exact: true }).click();
        recoveredOriginal = true;
      }
      await expect(page.getByLabel("Código de ingreso", { exact: true })).toBeEnabled({ timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
      await captureAdmissionReview(page, "contact-retry-replacement", [...privateValues, receivedCode], "contact-retry-captures.json", { selector: 'section[aria-labelledby][aria-busy]' });
      expect(originalReads).toBe(recoveredOriginal ? 1 : 0);
      expect(admissionPostRequests).toBe(2);
      expect(providerRequests).toBe(2);
      expect(errors).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows)).toEqual([{ status: "cancelled", version: 3 }]);
      expect(await fixture.counts()).toMatchObject({ challenges: 2, deliveries: 2, proofs: 1, memberships: 0 });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status from public.academy_admission_verification_proofs where id=${verifiedBody.result.proofId}`)).rows)).toEqual([{ status: "applied" }]);
    }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: "synthetic-sms-sender", ADMISSION_TEST_ZAVU_RECIPIENT: fixture.fixture.scope.contact.value, ADMISSION_TEST_ZAVU_DIAGNOSTIC_CHANNEL: "sms", ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onProviderRequest: () => { providerRequests++; }, onDiagnosticCode: (code) => { receivedCode = code; } }));
  });
});
