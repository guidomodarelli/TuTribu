/** @vitest-environment node */
/** Exercises a completed original denial through actual Next, native auth and SQL without sending a provider message. @module admission-issuance-denial-http-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native confirmed issuance denial HTTP", () => {
  it("should return and recover the same completed rejection after countries change without dispatching a message", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-denial-http", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionContactVerification(database, false, config, true), slug = `issue-${fixture.context.tribeId}`;
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006200000_scope_admission_audit_operations.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      let providerRequests = 0;
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), headers = { cookie: `better-auth.session_token=${cookie}`, origin, "content-type": "application/json" }, base = `${origin}/api/tribes/${slug}/admissions`;
        const input = { operationId: fixture.input.operationId, confirmed: true, expectedPolicyVersion: 2, channel: "sms", phone: "+5491155501234", country: "AR" };
        const post = () => fetch(`${base}/challenges`, { method: "POST", headers, body: JSON.stringify(input), signal: AbortSignal.timeout(180_000) });
        const first = await post();
        expect(first.status).toBe(422);
        expect(await first.json()).toMatchObject({ code: "recipient_not_allowed", operation: { operationId: input.operationId, state: "completed" } });
        await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`));
        const replay = await post();
        expect(replay.status).toBe(422);
        expect(await replay.json()).toMatchObject({ code: "recipient_not_allowed", operation: { operationId: input.operationId, state: "completed" } });
        const recovered = await fetch(`${base}/operations/${input.operationId}`, { headers, signal: AbortSignal.timeout(180_000) });
        expect(recovered.status).toBe(200);
        expect(await recovered.json()).toEqual({ type: "issue_contact_challenge", state: "completed", operationId: input.operationId, replayed: true, result: { purpose: "admission", result: "denied", code: "recipient_not_allowed" } });
        expect(providerRequests).toBe(0);
        expect(await fixture.counts()).toEqual({ challenges: 0, deliveries: 0, events: 0, operations: 1, proofs: 0, memberships: 0 });
      }, { preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], messagingSecurity, environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onProviderRequest: () => { providerRequests += 1; } }));
    });
  }, 600_000);
});
