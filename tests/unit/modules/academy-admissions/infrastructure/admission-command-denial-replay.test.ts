/** @vitest-environment node */
/** Exercises original terminal denials and read-only recovery through real current native accounts. @module admission-command-denial-replay-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresAdmissionOperationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-reader";
import { ReadAdmissionOperationUseCase } from "@/src/modules/academy-admissions/application/use-cases/read-admission-operation-use-case";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native original command denial replay", () => {
  it("should retain the submitted original denial after a later matching authorization, recover only for its actor and require a new explicit operation for admission", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), applicant = await createApplicant(), other = await createApplicant();
      await database.applyMigration("20261007002000_read_own_admission_operations.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      const input = { ...applicant.input, expectedPolicyVersion: 3 };
      expect(await applicant.commands.submit.execute(input)).toMatchObject({ ok: false, failure: { code: "admission_ineligible", operation: { operationId: input.operationId, state: "completed" } } });
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      expect((await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, displayName: null })).state).toBe("completed");
      expect(await applicant.commands.submit.execute(input)).toMatchObject({ ok: false, failure: { code: "admission_ineligible", operation: { operationId: input.operationId, state: "completed" } } });
      /** @param user - Exact persisted native account and session. @returns Its actual read-only own operation use case with no writer dependency. */
      const readerFor = (user: { userId: string; sessionId: string }) => {
        const accounts = new PostgresAuthenticatedAccountProvider(async () => user, (scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
        const reader = new PostgresAdmissionOperationReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
        return new ReadAdmissionOperationUseCase(accounts, reader, () => new Date());
      };
      const query = { tribeId: fixture.tribeId, operationId: input.operationId, requestId: randomUUID() };
      expect(await readerFor(applicant).execute(query)).toMatchObject({ ok: true, value: { type: "submit_admission", state: "completed", replayed: true, result: { outcome: "denied", code: "admission_ineligible", admissionRequestId: null } } });
      expect(await readerFor(other).execute(query)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select state,public_result->>'code' as code from public.academy_admission_operations where actor_user_id=${applicant.userId} and idempotency_key=${input.operationId}`)).rows).toEqual([{ state: "completed", code: "admission_ineligible" }]);
      });
      expect(await applicant.commands.submit.execute({ ...input, operationId: randomUUID() })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted" } } });
    });
  }, 1_200_000);

  it("should preserve explicit reviewer, cancellation and retry denials without any terminal request/access effect", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database), applicant = await createApplicant();
      await database.applyMigration("20261007002000_read_own_admission_operations.sql");
      const submitted = await applicant.commands.submit.execute({ ...applicant.input, message: "Explico mi excepción." });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Expected own pending for original denial matrix");
      const requestId = submitted.value.result.admissionRequestId, version = submitted.value.result.committedRequestVersion!;
      const cancellation = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: version + 1, confirmed: true as const };
      expect(await applicant.commands.cancelOwn.execute(cancellation)).toMatchObject({ ok: false, failure: { code: "request_conflict", operation: { operationId: cancellation.operationId, state: "completed" } } });
      expect(await applicant.commands.cancelOwn.execute(cancellation)).toMatchObject({ ok: false, failure: { code: "request_conflict", operation: { state: "completed" } } });
      await fixture.confirm(REAUTHENTICATION_OPERATION.advanceAdmissionRetry, requestId);
      const retry = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: version, confirmed: true as const, internalReason: "Reintento solicitado durante pendiente" };
      expect(await leader.allowRetry.execute(retry)).toMatchObject({ ok: false, failure: { code: "request_conflict", operation: { operationId: retry.operationId, state: "completed" } } });
      const decision = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: version + 1, confirmed: true as const, decision: "approve" as const, internalReason: "Revisión con versión anterior", externalMessage: null };
      expect(await leader.decide.execute(decision)).toMatchObject({ ok: false, failure: { code: "request_conflict", operation: { operationId: decision.operationId, state: "completed" } } });
      expect(await leader.decide.execute(decision)).toMatchObject({ ok: false, failure: { code: "request_conflict", operation: { state: "completed" } } });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: applicant.userId, sessionId: applicant.sessionId }), (scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
      const read = new ReadAdmissionOperationUseCase(accounts, new PostgresAdmissionOperationReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run)), () => new Date());
      expect(await read.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: cancellation.operationId })).toMatchObject({ ok: true, value: { type: "cancel_admission_request", state: "completed", result: { outcome: "denied", code: "request_conflict", admissionRequestId: requestId } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "pending", version }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${requestId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as members`)).rows).toEqual([{ decisions: 0, members: 0 }]);
      });
    });
  }, 1_200_000);
});
