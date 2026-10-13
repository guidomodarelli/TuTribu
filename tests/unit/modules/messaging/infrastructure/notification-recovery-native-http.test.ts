/** @vitest-environment node */
/** Exercises real Next/Better Auth/SQL recovery and original-result lookup without provider dispatch. @module notification-recovery-native-http-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareNotificationDeliveryRecovery } from "@/tests/support/notification-delivery-recovery-fixture";
import { refreshMessagingActivationRecency } from "@/tests/support/messaging-activation-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE, MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native notification recovery HTTP", () => {
  it("should recover once and read the original result after recency expires without dispatching or leaking private metadata", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => [purpose, { activeKeyId: purpose, keys: [{ id: purpose, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }]));
      const keyringsJson = JSON.stringify(keyrings), environment = "synthetic-recovery-http", securityEpoch = randomUUID();
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: environment, MESSAGING_SECURITY_EPOCH: securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: keyringsJson });
      const fixture = await prepareNotificationDeliveryRecovery(database, 3_600_000, config);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      const tribeId = fixture.context.tribeId, slug = `connection-${tribeId}`;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));
      let providerRequests = 0;
      await database.withServerEnvironment((serverEnvironment) => withAdmissionNextServer(serverEnvironment, slug, async (origin, secret) => {
        const cookie = encodeURIComponent(`${fixture.creation.sessionToken}.${await makeSignature(fixture.creation.sessionToken, secret)}`);
        const headers = { cookie: `better-auth.session_token=${cookie}`, origin, "content-type": "application/json" };
        const base = `${origin}/api/tribes/${slug}/messaging`, recoverUrl = `${base}/deliveries/${fixture.context.deliveryId}/recover`;
        const input = { ...fixture.input, reason: "authorized_connection_replacement" };
        const rejected = await fetch(recoverUrl, { method: "POST", headers, body: JSON.stringify({ ...input, deduplicationProven: true }) });
        expect(rejected.status).toBe(400);
        await refreshMessagingActivationRecency(database, fixture.creation, "recover_notification_delivery", fixture.context.deliveryId);
        const response = await fetch(recoverUrl, { method: "POST", headers, body: JSON.stringify(input) });
        expect(response.status).toBe(200);
        // Discard the write response and retrieve its original UUID; this does not claim a real TCP interruption.
        await response.arrayBuffer();
        const stale = await fetch(recoverUrl, { method: "POST", headers, body: JSON.stringify({ ...input, operationId: randomUUID() }) });
        expect(stale.status).toBe(409);
        expect(await stale.json()).toMatchObject({ code: "delivery_conflict" });
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where tribe_id=${tribeId} and invalidated_at is null`));
        const originalUrl = `${base}/notification-recovery-operations/${input.operationId}`;
        const original = await fetch(originalUrl, { headers });
        expect(original.status).toBe(200);
        expect(original.headers.get("cache-control")).toContain("no-store");
        const payload = await original.json();
        expect(payload).toMatchObject({ type: "recover_notification_delivery", state: "completed", operationId: input.operationId, replayed: true, result: { originalDeliveryId: fixture.context.deliveryId, originalVersion: 2, targetConnectionId: input.targetConnectionId, targetConnectionVersion: fixture.targetConfigurationVersion } });
        expect(Object.keys(payload.result).sort()).toEqual(["originalDeliveryId", "originalVersion", "recoveryDeliveryId", "targetConnectionId", "targetConnectionVersion"]);
        expect(providerRequests).toBe(0);
        const unchanged = await database.withContext(fixture.own, async (transaction) => ({
          original: (await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0],
          effects: (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}) as children,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${tribeId} and event_type='notification_delivery_recovered') as audits,(select count(*)::int from public.messaging_usage_reservations where tribe_id=${tribeId}) as reservations`)).rows[0],
        }));
        expect(unchanged).toEqual({ original: { state: "cancelled", version: 2 }, effects: { children: 1, audits: 1, reservations: fixture.baselineUsage.reservations } });
        expect((await fetch(`${base}/notification-recovery-operations/${randomUUID()}`, { headers })).status).toBe(404);
        expect((await fetch(recoverUrl, { method: "POST", headers, body: JSON.stringify({ ...input, operationId: randomUUID(), expectedVersion: 2 }) })).status).toBe(401);
        expect(providerRequests).toBe(0);
      }, { preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: randomUUID() }, messagingSecurity: { environment, securityEpoch, keyringsJson }, onProviderRequest: () => { providerRequests += 1; } }));
    });
  }, 1_200_000);
});
