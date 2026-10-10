/** @vitest-environment node */
/** Exercises genuine original metadata recovery with native actor isolation and canonical current leadership. @module personal-invitation-recovery-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { PostgresAdmissionOperationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-reader";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { ReadAdmissionOperationUseCase } from "@/src/modules/academy-admissions/application/use-cases/read-admission-operation-use-case";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal original recovery", () => {
  it("should read only the original leader metadata without a token or recency, then close after current role loss", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), applicant = await createApplicant();
      for (const migration of ["20261009130000_add_personal_invitation_context_digest.sql", "20261007002000_read_own_admission_operations.sql"]) await database.applyMigration(migration);
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const }, operationId = randomUUID();
      const created = await repository.create({ context, operationId, confirmed: true, contact: { type: "email", value: "recipient@example.test" }, internalName: "Historial privado", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected native initial token before readonly recovery");
      const initialToken = created.initialToken;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${fixture.userId} and tribe_id=${fixture.tribeId}`));
      /** @param identity - Exact current native session. @returns A real own registry use case with no writer/lease dependency. */
      const forIdentity = (identity: { userId: string; sessionId: string }) => new ReadAdmissionOperationUseCase(new PostgresAuthenticatedAccountProvider(async () => identity, (scope, run) => database.withContext({ userId: scope.userId, email: null }, run)), new PostgresAdmissionOperationReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run)), () => new Date());
      const query = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId };
      const recovered = await forIdentity(fixture).execute(query);
      expect(recovered).toMatchObject({ ok: true, value: { type: "create_personal_invitation", state: "completed", replayed: true, result: created.result } });
      expect(JSON.stringify(recovered)).not.toContain(initialToken);
      expect(await forIdentity(applicant).execute(query)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      expect(await forIdentity(fixture).execute(query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    });
  }, 1_200_000);
});
