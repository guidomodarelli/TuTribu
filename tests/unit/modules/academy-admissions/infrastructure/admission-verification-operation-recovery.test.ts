/** @vitest-environment node */
/** Exercises purpose-isolated original recovery over real PostgreSQL without claims, crypto or transport on read. @module admission-verification-operation-recovery-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresAdmissionOperationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-reader";
import { admissionChallengeSnapshotSchema, admissionChallengeVerificationSnapshotSchema } from "@/src/modules/academy-admissions/application/results/admission-contact-verification-schemas";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native contact verification operation recovery", () => {
  it("should exclude diagnostic and unknown-purpose issuance before ambiguity, preserve original admission states and retain current session authority", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      await database.applyMigration("20261007002000_read_own_admission_operations.sql");
      await database.applyMigration("20261008220000_scope_admission_operation_recovery.sql");
      await database.grantTablesToNonBypass(["session"]);
      const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async () => true, async () => fixture.fixture.config);
      const reader = new PostgresAdmissionOperationReader((_scope, run) => database.withContext(fixture.own, run, "non_bypass"));
      const snapshot = { purpose: "admission" as const, challengeId: randomUUID(), channel: "email" as const, maskedDestination: "a•••@example.test", expiresAt: "2026-10-08T22:10:00Z", resendAllowedAt: "2026-10-08T22:01:00Z", deliveryState: "queued" as const };
      const command = (operationType: string, operationId: string, purpose: string | null) => ({ actorUserId: fixture.context.userId, tribeId: fixture.context.tribeId, operationType, idempotencyKey: operationId, intent: { purpose, synthetic: true } });
      const collisionId = randomUUID();
      await ledger.run(command("issue_contact_challenge", collisionId, "connection_diagnostic"), admissionChallengeSnapshotSchema, async () => snapshot);
      await ledger.run(command("verify_contact_challenge", collisionId, null), admissionChallengeVerificationSnapshotSchema, async () => ({ purpose: "admission", result: "denied", code: "verification_code_incorrect" }));
      const original = await reader.read(fixture.context, collisionId);
      expect(original).toMatchObject({ operationType: "verify_contact_challenge", operation: { state: "completed", operationId: collisionId, replayed: true, result: { result: "denied", code: "verification_code_incorrect" } } });
      for (const operationType of ["issue_contact_challenge", "resend_contact_challenge"]) {
        const operationId = randomUUID();
        await expect(ledger.run(command(operationType, operationId, "admission"), admissionChallengeSnapshotSchema, async () => { throw new Error("Synthetic crash before challenge effects"); })).rejects.toMatchObject({ code: "operation_unresolved" });
        expect(await reader.read(fixture.context, operationId)).toEqual({ operationType, operation: { state: "started", operationId } });
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second',version=version+1 where actor_user_id=${fixture.context.userId} and idempotency_key=${operationId}`));
        await ledger.run(command(operationType, operationId, "admission"), admissionChallengeSnapshotSchema, async () => snapshot);
        expect(await reader.read(fixture.context, operationId)).toMatchObject({ operationType, operation: { state: "completed", operationId, replayed: true, result: snapshot } });
      }
      const unknownId = randomUUID();
      await ledger.run(command("issue_contact_challenge", unknownId, null), admissionChallengeSnapshotSchema, async () => snapshot);
      expect(await reader.read(fixture.context, unknownId)).toBeNull();
      const verifyOnlyId = randomUUID();
      await ledger.run(command("verify_contact_challenge", verifyOnlyId, null), admissionChallengeVerificationSnapshotSchema, async () => ({ purpose: "admission", result: "verified", proofId: randomUUID(), applyBefore: "2026-10-08T22:15:00Z" }));
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,state,version,lease_owner,lease_until,completed_at,public_result from public.academy_admission_operations where actor_user_id=${fixture.context.userId} order by id`)).rows);
      expect(await reader.read(fixture.context, verifyOnlyId)).toMatchObject({ operationType: "verify_contact_challenge", operation: { state: "completed", result: { result: "verified" } } });
      const after = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,state,version,lease_owner,lease_until,completed_at,public_result from public.academy_admission_operations where actor_user_id=${fixture.context.userId} order by id`)).rows);
      expect(after).toEqual(before);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select id from public.academy_admission_operations`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.context.sessionId}`));
      await expect(reader.read(fixture.context, verifyOnlyId)).rejects.toMatchObject({ code: "authentication_required" });
      expect(await fixture.counts()).toMatchObject({ challenges: 0, deliveries: 0, events: 0, proofs: 0, memberships: 0 });
    });
  }, 600_000);
});
