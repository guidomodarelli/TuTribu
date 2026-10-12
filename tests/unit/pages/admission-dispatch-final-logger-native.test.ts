/** @vitest-environment node */
/** Exercises the actual Next admission dispatch reporter after a native controlled completion failure. @module admission-dispatch-final-logger-native-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS, MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { MESSAGING_KEY_PURPOSE, MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { REQUEST_ID_HEADER, TRACE_ID_HEADER } from "@/src/modules/shared/infrastructure/observability/request-context";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native connected admission dispatch logger", () => {
  it("should emit correlated safe JSON from the actual root reporter after a completion cause contains credential, code and canary", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-final-logger", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionContactVerification(database, false, config, true);
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      const canary = randomUUID(), requestId = randomUUID(), traceId = randomUUID(), outputPath = join(process.cwd(), ".git", `codex-t164-connected-dispatch-log-${randomUUID()}.jsonl`);
      await writeFile(outputPath, "", "utf8");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      const slug = await database.withContext(fixture.fixture.own, async (transaction) => (await transaction.execute<{ slug: string }>(sql`select slug from public.tribes where id=${fixture.context.tribeId}`)).rows[0].slug);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`)}`;
        const response = await fetch(`${origin}/api/tribes/${slug}/admissions/challenges`, { method: "POST", headers: { origin, cookie, "content-type": "application/json", [REQUEST_ID_HEADER]: requestId, [TRACE_ID_HEADER]: traceId }, body: JSON.stringify({ operationId: randomUUID(), expectedPolicyVersion: fixture.input.expectedPolicyVersion + 1, confirmed: true, channel: "sms", phone: fixture.input.contact.value, country: "AR" }) });
        expect(response.status).toBe(201);
        const body = await response.json() as { state: string; result: { challengeId: string; deliveryId: string } };
        expect(body).toMatchObject({ state: "completed", result: { channel: "sms" } });
        let observations: { requestId: string; traceId: string; feature: string; operation: string; message: string; metadata: { stage: string; code: string; deliveryId: string; attemptId: string }; hasError: boolean; privateMaterialDetected: boolean; topLevelFields: string[]; metadataFields: string[] }[] = [];
        const observationDeadline = Date.now() + MESSAGING_DISPATCH_DEFAULT.runBudgetMs;
        while (Date.now() < observationDeadline && observations.length === 0) {
          const contents = await readFile(outputPath, "utf8");
          observations = contents.trim() ? contents.trim().split("\n").map((line) => JSON.parse(line)) : [];
          if (observations.length === 0) await delay(MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS);
        }
        expect(observations.length).toBeGreaterThan(0);
        for (const observation of observations) {
          expect(observation).toMatchObject({ requestId, traceId, feature: "academy-admissions", operation: "admission-contact-dispatch", message: "Admission contact verification dispatch failed", metadata: { stage: "complete", code: "operation_unresolved", deliveryId: body.result.deliveryId }, hasError: false, privateMaterialDetected: false });
          expect(observation.topLevelFields).toEqual(["feature", "level", "message", "metadata", "operation", "requestId", "traceId"]);
          expect(observation.metadataFields).toEqual(["attemptId", "code", "deliveryId", "stage"]);
          expect(observation.metadata.attemptId.length > 0).toBe(true);
        }
        await database.withContext(fixture.fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${body.result.deliveryId}`)).rows).toEqual([{ state: "consumed" }]);
          expect((await transaction.execute(sql`select state from public.message_delivery_attempts where delivery_id=${body.result.deliveryId}`)).rows).toEqual([{ state: "in_flight" }]);
          expect((await transaction.execute(sql`select count(*)::integer as members from public.tribe_members where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ members: 0 }]);
        });
      }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-admission-phone-provider-transport.mjs"), join(process.cwd(), "tests/support/native-dispatch-log-observer.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.input.contact.value, ADMISSION_TEST_ZAVU_SMS_SENDER: "synthetic-sms-sender", ADMISSION_TEST_ZAVU_WHATSAPP_SENDER: "synthetic-whatsapp-sender", ADMISSION_TEST_ZAVU_TEMPLATE_ID: "synthetic-otp-template", ADMISSION_TEST_DISPATCH_LOG_CANARY: canary, ADMISSION_TEST_DISPATCH_LOG_OUTPUT: outputPath } }));
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
