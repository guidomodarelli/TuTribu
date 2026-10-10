/** Exercises a genuine canceled request and fresh contact entry without losing earlier code references. @module academy-contact-retry-e2e */
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

test("should let a new authorized presentation choose another contact after real cancellation without restoring its earlier challenge", async ({ page, context }) => {
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
    let providerRequests = 0;
    await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
      await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
      /** @param path - Own action path. @param data - Original synthetic proposal. @returns The native response without exposing cookie/body in request failure logs. */
      const post = async (path: string, data: unknown) => {
        try { return await context.request.post(`${origin}/api/tribes/${slug}/admissions${path}`, { headers: { origin }, data }); }
        catch { throw new Error("Contact retry request could not be observed"); }
      };
      const issued = await post("/challenges", { operationId: issueOperationId, confirmed: true, expectedPolicyVersion: 2, channel: "sms", phone: fixture.fixture.scope.contact.value, country: "AR" });
      expect(issued.status()).toBe(201);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${requestId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '2 days',now+interval '28 days' from instant`));
      const canceled = await post(`/requests/${requestId}/cancel`, { operationId: randomUUID(), confirmed: true, expectedVersion: 1 });
      expect(canceled.status()).toBe(200);
      const originalKey = `${ADMISSION_CONTACT_STORAGE_PREFIX}:${encodeURIComponent(fixture.context.userId)}:${encodeURIComponent(slug)}:`;
      const original = { viewerId: fixture.context.userId, slug, requestId: null, issuedOperationId: issueOperationId, verifiedOperationId: null, pending: null };
      await page.addInitScript(({ key, record }) => sessionStorage.setItem(key, JSON.stringify(record)), { key: originalKey, record: original });
      let originalReads = 0, writes = 0, errors = 0;
      page.on("pageerror", () => errors++);
      page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.includes("/admissions/operations/")) originalReads++; if (request.method() === "POST" && path.includes("/admissions/")) writes++; });
      await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "domcontentloaded" });
      const phone = page.getByLabel("Teléfono para este ingreso", { exact: true });
      await expect(phone).toBeEnabled({ timeout: ADMISSION_CONTACT_BROWSER_TIMEOUT_MS });
      await expect(page.getByRole("checkbox", { name: "Confirmo el contacto y el envío del código para este ingreso.", exact: true })).not.toBeChecked();
      await expect(page.getByText("Código comprobado para este ingreso.", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Enviar código de ingreso", exact: true })).toBeDisabled();
      await phone.fill("+5491155505678");
      expect(await phone.inputValue() === "+5491155505678").toBe(true);
      expect(await page.evaluate((key) => sessionStorage.getItem(key) !== null, originalKey)).toBe(true);
      expect(originalReads).toBe(0);
      expect(writes).toBe(0);
      expect(providerRequests).toBe(1);
      expect(errors).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows)).toEqual([{ status: "cancelled", version: 2 }]);
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, proofs: 0, memberships: 0 });
    }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: "synthetic-sms-sender", ADMISSION_TEST_ZAVU_RECIPIENT: fixture.fixture.scope.contact.value, ADMISSION_TEST_ZAVU_DIAGNOSTIC_CHANNEL: "sms", ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onProviderRequest: () => { providerRequests++; } }));
  });
});
