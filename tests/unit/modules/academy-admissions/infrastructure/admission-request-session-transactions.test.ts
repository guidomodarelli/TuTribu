/** @vitest-environment node */
/** Exercises real admission commits and native session changes without redundant account checkouts. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresAuthenticatedAccountProvider, type CurrentGlobalSessionIdentity } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { OPERATION_STATE } from "@/src/constants/operation-state";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission session transaction scope", () => {
  it("should use three real checkouts and retain revocation and changed-cookie rejection between commits", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      /** @param participant - Native account/session seeded on the owned branch. @param afterClaim - Own commit boundary, never a driver hook. @returns Real product use cases and a controllable trusted identity source. */
      const commands = (participant: Awaited<ReturnType<typeof applicant>>, afterClaim?: () => Promise<void>) => {
        let currentIdentity: CurrentGlobalSessionIdentity | null = { userId: participant.userId, sessionId: participant.sessionId };
        let commits = 0;
        const accounts = new PostgresAuthenticatedAccountProvider(async () => currentIdentity, (identity, run) => database.withContext({ userId: identity.userId, email: null }, run));
        const useCases = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: async (account, run) => {
          const result = await database.withContext({ userId: account.userId, email: account.normalizedEmail }, run);
          commits += 1;
          if (commits === 1) await afterClaim?.();
          return result;
        } }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
        return { useCases, changeIdentity: (identity: CurrentGlobalSessionIdentity | null) => { currentIdentity = identity; } };
      };
      const first = await applicant(), firstCommands = commands(first);
      const input = { ...first.input, message: "Revisar mi pertenencia al grupo de prueba" };
      const before = database.readPoolMetrics();
      const submitted = await firstCommands.useCases.submit.execute(input);
      const after = database.readPoolMetrics();
      expect(after.acquisitions - before.acquisitions).toBe(3);
      expect(after.releases - before.releases).toBe(3);
      expect(submitted).toMatchObject({ ok: true, value: { state: OPERATION_STATE.completed, result: { outcome: ADMISSION_OUTCOME.pending } } });
      const replay = await firstCommands.useCases.submit.execute(input);
      expect(replay).toMatchObject({ ok: true, value: { state: OPERATION_STATE.completed, replayed: true } });
      if (!submitted.ok || submitted.value.state !== OPERATION_STATE.completed || !replay.ok || replay.value.state !== OPERATION_STATE.completed) throw new Error("Admission session transaction fixture failed: original_outcome_unavailable");
      expect(replay.value.result).toEqual(submitted.value.result);

      const revoked = await applicant();
      const revokedCommands = commands(revoked, () => database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`delete from public.session where id=${revoked.sessionId} and "userId"=${revoked.userId}`);
      }));
      expect(await revokedCommands.useCases.submit.execute({ ...revoked.input, message: input.message })).toMatchObject({ ok: false, failure: { code: ADMISSION_ERROR_CODE.authenticationRequired } });

      const changed = await applicant();
      const changedCommands = commands(changed, async () => { changedCommands.changeIdentity({ userId: fixture.userId, sessionId: fixture.sessionId }); });
      expect(await changedCommands.useCases.submit.execute({ ...changed.input, message: input.message })).toMatchObject({ ok: false, failure: { code: ADMISSION_ERROR_CODE.authenticationRequired } });
      const renewed = await applicant();
      const renewedCommands = commands(renewed, async () => { renewedCommands.changeIdentity({ userId: renewed.userId, sessionId: randomUUID() }); });
      expect(await renewedCommands.useCases.submit.execute({ ...renewed.input, message: input.message })).toMatchObject({ ok: false, failure: { code: ADMISSION_ERROR_CODE.authenticationRequired } });

      const facts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ requests: number; members: number; deliveries: number }>(sql`select
        (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,
        (select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id in (${first.userId},${revoked.userId},${changed.userId},${renewed.userId})) as members,
        (select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
      expect(facts).toEqual({ requests: 1, members: 0, deliveries: 0 });
      expect(database.readPoolMetrics().waitingCount).toBe(0);
    });
  }, 1_200_000);
});
