/** @vitest-environment node */
/** Exercises retained contact identity and fail-closed retirement on both sides of the real SQL continuity window. @module contact-key-retirement-window-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import type { AdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { assertMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native contact key retirement window", () => {
  it("should preserve bridged historical identity and refuse unbridged recent consumption without altering its recorded time", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const security = await prepareContactVerificationDatabase(database);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      const userId = randomUUID(), tribeId = randomUUID(), own = { userId, email: `${userId}@example.test` };
      await database.withContext(security.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Participante histórico de ejemplo',${own.email},false,transaction_timestamp()-interval '48 hours',transaction_timestamp()-interval '48 hours')`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,created_at) values (${tribeId},'Academia histórica de presupuestos',${`window-${tribeId}`},${userId},transaction_timestamp()-interval '47 hours')`);
      });
      const contact = { type: "email" as const, value: own.email };
      const authorize = async (transaction: Parameters<Parameters<typeof database.withContext>[1]>[0]) => Boolean((await transaction.execute(sql`select id from public."user" where id=${userId} and id=public.current_app_user_id()`)).rows[0]);
      const resolve = (config: MessagingSecurityConfig) => database.withContext(own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, authorize, async () => config).resolve(contact));
      /** @param historicalContact - Exact original contact. @returns An initially historical protected subject whose alias predates its recorded usage. */
      const seedHistoricalSubject = async (historicalContact: AdmissionContact) => {
        const subjectId = randomUUID(), fingerprint = await createAdmissionContactFingerprint(historicalContact, security.config);
        await database.withContext(own, async (transaction) => {
          await transaction.execute(sql`insert into public.messaging_contact_budget_subjects(id,created_at) values (${subjectId},transaction_timestamp()-interval '46 hours')`);
          await transaction.execute(sql`insert into public.messaging_contact_fingerprint_aliases(subject_id,fingerprint_key_id,contact_fingerprint,created_at) values (${subjectId},${fingerprint.keyId},${Buffer.from(fingerprint.digest)},transaction_timestamp()-interval '45 hours')`);
        });
        return subjectId;
      };
      const historicalSubject = await seedHistoricalSubject(contact);
      const original = await resolve(security.config), olderEvent = randomUUID();
      expect(original.subjectId).toBe(historicalSubject);
      await database.withContext(own, (transaction) => transaction.execute(sql`insert into public.messaging_usage_events(id,tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id,occurred_at) values (${olderEvent},${tribeId},${userId},${original.subjectId},'admission','email','code_request',${randomUUID()},transaction_timestamp()-interval '25 hours')`));
      const keyId = randomUUID(), key = await crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
      const oldRing = security.config.keyrings.contact_fingerprint;
      const removed: MessagingSecurityConfig = { ...security.config, keyrings: { ...security.config.keyrings, contact_fingerprint: { ...oldRing, activeKeyId: keyId, keys: new Map([[keyId, key]]) } } };
      await database.withContext({ userId: null, email: null }, (transaction) => assertMessagingPrivateMacKeyMaterial(transaction, removed, "contact_fingerprint"));
      // Expired unrecognized consumption does not keep every new identity closed indefinitely.
      const afterWindow = await resolve(removed);
      expect(afterWindow.subjectId === original.subjectId).toBe(false);
      const recentEvent = randomUUID();
      await database.withContext(own, (transaction) => transaction.execute(sql`insert into public.messaging_usage_events(id,tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id,occurred_at) values (${recentEvent},${tribeId},${userId},${original.subjectId},'admission','email','code_request',${randomUUID()},transaction_timestamp()-interval '23 hours')`));
      /** @returns Immutable event identity, protected subject and timestamp without the contact itself. */
      const events = () => database.withContext(own, async (transaction) => (await transaction.execute(sql`select id,contact_subject_id,occurred_at::text from public.messaging_usage_events where id in (${olderEvent},${recentEvent}) order by id`)).rows);
      const before = await events();
      const otherContact = { type: "email" as const, value: `new.${randomUUID()}@example.test` };
      await expect(database.withContext(own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, authorize, async () => removed).resolve(otherContact))).rejects.toMatchObject({ code: "usage_limit_reached" });
      expect(await events()).toEqual(before);
      // Bridge a different original contact before retirement; all recorded consumption remains unchanged.
      const bridgedContact = { type: "email" as const, value: `bridged.${randomUUID()}@example.test` };
      const historicalBridgeSubject = await seedHistoricalSubject(bridgedContact);
      const originalBridge = await database.withContext(own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, authorize, async () => security.config).resolve(bridgedContact));
      expect(originalBridge.subjectId).toBe(historicalBridgeSubject);
      const bridgeEventId = randomUUID();
      await database.withContext(own, (transaction) => transaction.execute(sql`insert into public.messaging_usage_events(id,tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id,occurred_at) values (${bridgeEventId},${tribeId},${userId},${originalBridge.subjectId},'admission','email','code_request',${randomUUID()},transaction_timestamp()-interval '23 hours')`));
      const retained: MessagingSecurityConfig = { ...removed, keyrings: { ...removed.keyrings, contact_fingerprint: { ...removed.keyrings.contact_fingerprint, keys: new Map([...oldRing.keys, [keyId, key]]) } } };
      const bridge = await database.withContext(own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, authorize, async () => retained).resolve(bridgedContact));
      expect(bridge.subjectId).toBe(originalBridge.subjectId);
      expect((await database.withContext(own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, authorize, async () => removed).resolve(bridgedContact))).subjectId).toBe(originalBridge.subjectId);
      expect(await events()).toEqual(before);
      expect(await database.withContext(own, async (transaction) => (await transaction.execute(sql`select contact_subject_id from public.messaging_usage_events where id=${bridgeEventId}`)).rows)).toEqual([{ contact_subject_id: originalBridge.subjectId }]);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
