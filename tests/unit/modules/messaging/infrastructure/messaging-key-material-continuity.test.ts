/** @vitest-environment node */
/** Exercises immutable HMAC material on real protected subjects and original ledgers, without provider calls. @module messaging-key-material-continuity-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { prepareContactVerificationIssuer, contactVerificationIssuanceSnapshotSchema } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";

/** @returns Independent native HMAC material deliberately routed through an existing id. */
const changedKey = () => crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native immutable key material", () => {
  it("should reject changed contact material under the same id without allocating another subject or changing existing consumption", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database), tribeId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia de continuidad de ejemplo',${`material-${tribeId}`},${fixture.userId})`));
      const resolve = (config: typeof fixture.config) => database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async (current) => Boolean((await current.execute(sql`select id from public."user" where id=public.current_app_user_id()`)).rows[0]), async () => config).resolve({ type: "email", value: fixture.own.email }));
      const original = await resolve(fixture.config), eventId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.messaging_usage_events(id,tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id) values (${eventId},${tribeId},${fixture.userId},${original.subjectId},'admission','email','code_request',${randomUUID()})`));
      const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
        events: (await transaction.execute(sql`select id,contact_subject_id,occurred_at::text from public.messaging_usage_events where id=${eventId}`)).rows,
        totals: (await transaction.execute(sql`select (select count(*)::integer from public.messaging_contact_budget_subjects) as subjects,(select count(*)::integer from public.messaging_contact_fingerprint_aliases) as aliases,(select count(*)::integer from public.messaging_key_material_proofs) as proofs`)).rows,
      }));
      const before = await snapshot(), ring = fixture.config.keyrings.contact_fingerprint;
      const changed = { ...fixture.config, keyrings: { ...fixture.config.keyrings, contact_fingerprint: { ...ring, keys: new Map([[ring.activeKeyId, await changedKey()]]) } } };
      await expect(resolve(changed)).rejects.toMatchObject({ code: "resource_unavailable", cause: { code: "messaging_crypto_key_continuity_unproven" } });
      expect(await snapshot()).toEqual(before);
      expect((await resolve(fixture.config)).subjectId).toBe(original.subjectId);
      expect(await snapshot()).toEqual(before);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select verifier from public.messaging_key_material_proofs`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.messaging_key_material_proofs`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should reject changed payload material before replay or a new claim can alter the original operation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database), operationId = randomUUID();
      const issued = await fixture.issue(null, operationId);
      if (issued.state !== "completed") throw new Error("Synthetic key material setup failed: original claim incomplete");
      expect(issued).toMatchObject({ state: "completed", replayed: false, result: { outcome: "issued" } });
      const ring = fixture.config.keyrings.operation_payload, changed = { ...fixture.config, keyrings: { ...fixture.config.keyrings, operation_payload: { ...ring, keys: new Map([[ring.activeKeyId, await changedKey()]]) } } };
      const command = { actorUserId: fixture.userId, tribeId: fixture.scope.tribeId, operationType: VERIFICATION_ISSUANCE_OPERATION.issue, idempotencyKey: operationId, intent: { expectedCurrentChallengeId: null, contact: fixture.scope.contact.value, channel: fixture.scope.channel, purpose: fixture.scope.purpose, connectionId: fixture.scope.connectionId, connectionVersion: 1 } };
      const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
        original: (await transaction.execute(sql`select id,state,version,public_result,created_at::text,completed_at::text from public.academy_admission_operations where tribe_id=${fixture.scope.tribeId} and idempotency_key=${operationId}`)).rows,
        totals: (await transaction.execute(sql`select (select count(*)::integer from public.academy_admission_operations) as operations,(select count(*)::integer from public.messaging_usage_events) as events,(select count(*)::integer from public.message_deliveries) as deliveries`)).rows,
      }));
      const before = await snapshot();
      const repository = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async (transaction) => Boolean((await transaction.execute(sql`select id from public.tribes where id=${fixture.scope.tribeId}`)).rows[0]), async () => changed);
      await expect(repository.read(command, contactVerificationIssuanceSnapshotSchema)).rejects.toMatchObject({ code: "resource_unavailable", cause: { code: "messaging_crypto_key_continuity_unproven" } });
      let mutations = 0;
      await expect(repository.run({ ...command, idempotencyKey: randomUUID() }, contactVerificationIssuanceSnapshotSchema, async () => { mutations += 1; return issued.result; })).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(mutations).toBe(0);
      expect(await snapshot()).toEqual(before);
      expect(await fixture.ledger.read(command, contactVerificationIssuanceSnapshotSchema)).toMatchObject({ state: "completed", replayed: true });
      expect(await snapshot()).toEqual(before);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should keep a historical unattested identity closed until explicit private reconciliation confirms its original material", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database), keyId = randomUUID(), subjectId = randomUUID(), tribeId = randomUUID(), eventId = randomUUID();
      const original = { ...fixture.config, keyrings: { ...fixture.config.keyrings, contact_fingerprint: { ...fixture.config.keyrings.contact_fingerprint, activeKeyId: keyId, keys: new Map([[keyId, await changedKey()]]) } } };
      const contact = { type: "email" as const, value: fixture.own.email }, fingerprint = await createAdmissionContactFingerprint(contact, original);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia histórica de ejemplo',${`legacy-key-${tribeId}`},${fixture.userId})`);
        await transaction.execute(sql`insert into public.messaging_contact_budget_subjects(id) values (${subjectId})`);
        await transaction.execute(sql`insert into public.messaging_contact_fingerprint_aliases(subject_id,fingerprint_key_id,contact_fingerprint) values (${subjectId},${keyId},${Buffer.from(fingerprint.digest)})`);
        await transaction.execute(sql`insert into public.messaging_usage_events(id,tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id) values (${eventId},${tribeId},${fixture.userId},${subjectId},'admission','email','code_request',${randomUUID()})`);
      });
      const resolve = () => database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async (current) => Boolean((await current.execute(sql`select id from public."user" where id=public.current_app_user_id()`)).rows[0]), async () => original).resolve(contact));
      const events = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,contact_subject_id,occurred_at::text from public.messaging_usage_events where id=${eventId}`)).rows);
      const before = await events();
      await expect(resolve()).rejects.toMatchObject({ code: "resource_unavailable", cause: { code: "messaging_crypto_key_continuity_unproven" } });
      expect(await events()).toEqual(before);
      await expect(database.withContext({ userId: null, email: null }, (transaction) => registerMessagingPrivateMacKeyMaterial(transaction, original, "contact_fingerprint"), "non_bypass")).rejects.toMatchObject({ code: "messaging_crypto_context_mismatch" });
      await database.withContext({ userId: null, email: null }, (transaction) => registerMessagingPrivateMacKeyMaterial(transaction, original, "contact_fingerprint"));
      expect((await resolve()).subjectId).toBe(subjectId);
      expect(await events()).toEqual(before);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
