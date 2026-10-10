/** @vitest-environment node */
/** Exercises proof/contact/request/ledger atomicity without a messaging provider or membership grant. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase, seedContactVerificationChallenge, createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresAdmissionVerificationProofWriter } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-verification-proof-writer";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Validates the actual minimal result committed into the durable operation ledger. */
const resultSchema = z.union([
  z.strictObject({ outcome: z.literal("applied"), requestId: z.uuid(), requestVersion: z.int().positive(), status: z.literal("pending"), proofId: z.uuid() }),
  z.strictObject({ outcome: z.literal("denied"), code: z.enum(Object.values(ADMISSION_ERROR_CODE)) }),
]);

/** Seeds a real available proof and pending request, with optional previously declared contact. */
async function prepareApplication(database: AcademyAdmissionTestDatabase, contact: string | null | ((email: string) => string) = null, history?: { issuedAt: Date; verifiedAt: Date }) {
  const fixture = await prepareContactVerificationDatabase(database);
  await database.applyMigration("20261005101000_guard_admission_operation_identity.sql");
  const challenge = await seedContactVerificationChallenge(database, fixture, "admission", history?.issuedAt);
  let proofId: string;
  if (history) {
    proofId = await database.withContext(fixture.own, async (transaction) => {
      await transaction.execute(sql`update public.contact_verification_challenges set state='verified',version=version+1,verified_at=${history.verifiedAt},code_mac=null,code_envelope_id=null where id=${challenge.challengeId}`);
      await transaction.execute(sql`delete from public.verification_code_envelopes where id=${challenge.envelopeId}`);
      return (await transaction.execute<{ id: string }>(sql`insert into public.academy_admission_verification_proofs(challenge_id,user_id,tribe_id,contact_type,normalized_contact,verification_epoch,connection_id,connection_version,security_epoch,verified_at,apply_before) values (${challenge.challengeId},${fixture.userId},${challenge.scope.tribeId},'email',${fixture.own.email},1,${challenge.scope.connectionId},1,${challenge.scope.securityEpoch},${history.verifiedAt},${new Date(history.verifiedAt.getTime()+900_000)}) returning id`)).rows[0].id;
    });
  } else {
    const verified = await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: challenge.scope, challengeId: challenge.challengeId, operationId: randomUUID(), code: challenge.code }));
    if (verified.outcome !== "verified" || !verified.proofId) throw new Error("Synthetic code did not produce its available admission proof");
    proofId = verified.proofId;
  }
  const requestId = randomUUID();
  const initialContact = typeof contact === "function" ? contact(fixture.own.email) : contact;
  await database.withContext(fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) values (${requestId},${challenge.scope.tribeId},${fixture.userId},'common',${initialContact === null ? null : 'email'},${initialContact},${initialContact === null ? 'none' : 'declared'},${now},${new Date(now.getTime()+30*86_400_000)})`);
  });
  const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at,status,version from public.academy_admission_requests where id=${requestId}`)).rows[0]);
  const operationId = randomUUID();
  const command = { actorUserId: fixture.userId, tribeId: challenge.scope.tribeId, operationType: "attach_admission_proof", idempotencyKey: operationId, intent: { requestId, proofId, expectedRequestVersion: 1 } };
  const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async () => true, async () => fixture.config);
  const apply = () => ledger.run(command, resultSchema, (transaction, ledgerId) => new PostgresAdmissionVerificationProofWriter(transaction, async () => true, async () => fixture.config).applyToPending({ scope: challenge.scope, requestId, proofId, expectedRequestVersion: 1, operationId, ledgerId }));
  return { ...fixture, challenge, proofId, requestId, before, operationId, command, ledger, apply };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission proof application", () => {
  it("should attach the first verified contact once with its binding and audit while preserving the pending deadline", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareApplication(database);
      expect(await fixture.apply()).toMatchObject({ state: "completed", replayed: false, result: { outcome: "applied", requestId: fixture.requestId, requestVersion: 2, proofId: fixture.proofId, status: "pending" } });
      expect(await fixture.apply()).toMatchObject({ state: "completed", replayed: true, result: { requestVersion: 2 } });
      await database.withContext(fixture.own, async (transaction) => {
        const after = (await transaction.execute(sql`select submitted_at,expires_at,status,version,contact_type,normalized_contact,evidence_source,proof_id,binding_id from public.academy_admission_requests where id=${fixture.requestId}`)).rows[0];
        expect(after).toMatchObject({ ...fixture.before, version: 2, contact_type: "email", normalized_contact: fixture.own.email, evidence_source: "local", proof_id: fixture.proofId, binding_id: expect.any(String) });
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${fixture.proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: fixture.requestId }]);
        expect((await transaction.execute(sql`select owner_user_id,first_request_id,first_proof_id from public.academy_admission_contact_bindings where id=${after.binding_id}`)).rows).toEqual([{ owner_user_id: fixture.userId, first_request_id: fixture.requestId, first_proof_id: fixture.proofId }]);
        const audits = (await transaction.execute<{ event_type: string; metadata: unknown }>(sql`select event_type,metadata from public.academy_admission_audit_events where resource_id=${fixture.requestId}`)).rows;
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ event_type: "proof_attached" });
        expect(JSON.stringify(audits)).not.toContain(fixture.own.email);
        expect((await transaction.execute(sql`select user_id from public.tribe_members where tribe_id=${fixture.challenge.scope.tribeId}`)).rows).toEqual([]);
      });
    });
  }, 180_000);

  it("should reject changing a fixed contact or a stale request version without applying or claiming the proof", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareApplication(database, "fixed@example.test");
      expect(await fixture.apply()).toMatchObject({ state: "completed", result: { outcome: "denied", code: "contact_binding_conflict" } });
      const operationId = randomUUID();
      const result = await fixture.ledger.run({ ...fixture.command, idempotencyKey: operationId, intent: { ...fixture.command.intent, expectedRequestVersion: 2 } }, resultSchema, (transaction, ledgerId) => new PostgresAdmissionVerificationProofWriter(transaction, async () => true, async () => fixture.config).applyToPending({ scope: fixture.challenge.scope, requestId: fixture.requestId, proofId: fixture.proofId, expectedRequestVersion: 2, operationId, ledgerId }));
      expect(result).toMatchObject({ state: "completed", result: { outcome: "denied", code: "request_conflict" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select version,normalized_contact,proof_id,binding_id from public.academy_admission_requests where id=${fixture.requestId}`)).rows).toEqual([{ version: 1, normalized_contact: "fixed@example.test", proof_id: null, binding_id: null }]);
        expect((await transaction.execute(sql`select status from public.academy_admission_verification_proofs where id=${fixture.proofId}`)).rows).toEqual([{ status: "available" }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_contact_bindings where tribe_id=${fixture.challenge.scope.tribeId}`)).rows).toEqual([]);
      });
    });
  }, 180_000);

  it("should roll back proof, request, binding and audit together when the enclosing mutation fails", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareApplication(database);
      await expect(fixture.ledger.run(fixture.command, resultSchema, async (transaction, ledgerId) => {
        expect(await new PostgresAdmissionVerificationProofWriter(transaction, async () => true, async () => fixture.config).applyToPending({ scope: fixture.challenge.scope, requestId: fixture.requestId, proofId: fixture.proofId, expectedRequestVersion: 1, operationId: fixture.operationId, ledgerId })).toMatchObject({ outcome: "applied" });
        throw new Error("Controlled proof attachment transaction loss");
      })).rejects.toMatchObject({ code: "operation_unresolved" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select version,proof_id,binding_id from public.academy_admission_requests where id=${fixture.requestId}`)).rows).toEqual([{ version: 1, proof_id: null, binding_id: null }]);
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${fixture.proofId}`)).rows).toEqual([{ status: "available", applied_request_id: null }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_contact_bindings where tribe_id=${fixture.challenge.scope.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.academy_admission_audit_events where resource_id=${fixture.requestId}`)).rows).toEqual([]);
      });
      expect(await fixture.ledger.read(fixture.command, resultSchema)).toMatchObject({ state: "started" });
    });
  }, 180_000);

  it("should keep a fresh proof usable after its original code expired and reject an expired proof without a contact claim", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const now = Date.now();
      const fixture = await prepareApplication(database, null, { issuedAt: new Date(now-12*60_000), verifiedAt: new Date(now-3*60_000) });
      expect(await fixture.apply()).toMatchObject({ state: "completed", result: { outcome: "applied" } });
      const expiredId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        // A formal invalidation is irreversible; it must not be restored by another attachment attempt.
        await transaction.execute(sql`update public.academy_admission_verification_proofs set status='invalid',invalidated_at=clock_timestamp(),invalidation_reason='synthetic_compromise' where id=${fixture.proofId}`);
      });
      const result = await fixture.ledger.run({ ...fixture.command, idempotencyKey: expiredId, intent: { ...fixture.command.intent, expectedRequestVersion: 2 } }, resultSchema, (transaction, ledgerId) => new PostgresAdmissionVerificationProofWriter(transaction, async () => true, async () => fixture.config).applyToPending({ scope: fixture.challenge.scope, requestId: fixture.requestId, proofId: fixture.proofId, expectedRequestVersion: 2, operationId: expiredId, ledgerId }));
      expect(result).toMatchObject({ state: "completed", result: { outcome: "denied", code: "proof_unavailable" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,proof_id from public.academy_admission_requests where id=${fixture.requestId}`)).rows)).toEqual([{ version: 2, proof_id: fixture.proofId }]);
    });
    await withAcademyAdmissionDatabase(async (database) => {
      const now = Date.now();
      const fixture = await prepareApplication(database, null, { issuedAt: new Date(now-30*60_000), verifiedAt: new Date(now-21*60_000) });
      expect(await fixture.apply()).toMatchObject({ state: "completed", result: { outcome: "denied", code: "proof_unavailable" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_contact_bindings where tribe_id=${fixture.challenge.scope.tribeId}`)).rows)).toEqual([]);
    });
  }, 180_000);

  it("should upgrade the same declared contact and preserve an earlier binding owned by a different account", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareApplication(database, (email) => email);
      expect(await fixture.apply()).toMatchObject({ state: "completed", result: { outcome: "applied" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select normalized_contact,evidence_source,version from public.academy_admission_requests where id=${fixture.requestId}`)).rows)).toEqual([{ normalized_contact: fixture.own.email, evidence_source: "local", version: 2 }]);
    });
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareApplication(database);
      const previousOwnerId = randomUUID(), previousRequestId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${previousOwnerId},'Synthetic previous contact owner',${`${previousOwnerId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) values (${previousRequestId},${fixture.challenge.scope.tribeId},${previousOwnerId},'common','email',${fixture.own.email},'base',clock_timestamp(),clock_timestamp()+interval '30 days')`);
        await transaction.execute(sql`insert into public.academy_admission_contact_bindings(tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source) values (${fixture.challenge.scope.tribeId},'email',${fixture.own.email},${new Uint8Array(32)},'synthetic-prior-fingerprint',${previousOwnerId},${previousRequestId},'base')`);
      });
      expect(await fixture.apply()).toMatchObject({ state: "completed", result: { outcome: "denied", code: "contact_binding_conflict" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select owner_user_id from public.academy_admission_contact_bindings where tribe_id=${fixture.challenge.scope.tribeId}`)).rows).toEqual([{ owner_user_id: previousOwnerId }]);
        expect((await transaction.execute(sql`select status from public.academy_admission_verification_proofs where id=${fixture.proofId}`)).rows).toEqual([{ status: "available" }]);
        expect((await transaction.execute(sql`select version,contact_type,normalized_contact,binding_id from public.academy_admission_requests where id=${fixture.requestId}`)).rows).toEqual([{ version: 1, contact_type: null, normalized_contact: null, binding_id: null }]);
      });
    });
  }, 180_000);
});
