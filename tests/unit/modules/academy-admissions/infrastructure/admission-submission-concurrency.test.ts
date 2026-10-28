/** @vitest-environment node */
/** Observes actual application commands while another applicant's staged transaction remains uncommitted. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionPerformanceFixture, type AdmissionPerformanceParticipant } from "@/tests/support/admission-performance-fixture";
import { ADMISSION_PERFORMANCE } from "@/tests/support/constants/admission-performance";
import { ADMISSION_SUBMISSION_CONCURRENCY_TEST } from "@/tests/support/constants/admission-submission-concurrency";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import type { SubmitAdmissionInput } from "@/src/modules/academy-admissions/application/use-cases/submit-admission-use-case";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native independent admission submissions", () => {
  it("should commit another applicant while the first applicant's completed effects remain uncommitted", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, participants } = await prepareAdmissionPerformanceFixture(database);
      const ready = Promise.withResolvers<{ pid: number; deadline: string }>();
      const released = Promise.withResolvers<void>();
      let announced = false, wasReleased = false;
      void released.promise.then(() => { wasReleased = true; });

      /** @param transaction - Original effects transaction, with its claim already committed separately. @returns After the owned barrier is released or its native deadline fails. */
      const holdCommit = async (transaction: RequestDatabase) => {
        if (announced) return;
        const scope = (await transaction.execute<{ pid: number; deadline: string }>(sql`select pg_backend_pid() as pid,clock_timestamp()+${ADMISSION_SUBMISSION_CONCURRENCY_TEST.holdDeadlineSeconds}*interval '1 second' as deadline`)).rows[0];
        announced = true;
        ready.resolve(scope);
        while (!wasReleased) {
          const current = (await transaction.execute<{ live: boolean }>(sql`select clock_timestamp()<${scope.deadline}::timestamptz as live,pg_sleep(${ADMISSION_SUBMISSION_CONCURRENCY_TEST.heartbeatSeconds})`)).rows[0];
          if (!current.live) throw new Error("Admission submission commit barrier failed: native_deadline_exceeded");
        }
      };
      /** @param participant - Native synthetic account and bound session. @param afterEffects - Optional pause at the own application transaction boundary. @returns Real composed commands without replacing PostgreSQL, auth or provider SDK methods. */
      const commands = (participant: AdmissionPerformanceParticipant, afterEffects?: (transaction: RequestDatabase) => Promise<void>) => {
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: participant.userId, sessionId: participant.sessionId }), (_identity, run) => database.withContext({ userId: participant.userId, email: participant.email }, run));
        return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, async (transaction) => {
          const result = await run(transaction);
          if (afterEffects && typeof result === "object" && result !== null && "state" in result && result.state === OPERATION_STATE.completed) await afterEffects(transaction);
          return result;
        }) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
      };
      const firstInput = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: ADMISSION_PERFORMANCE.expectedPolicyVersion, confirmed: true } satisfies SubmitAdmissionInput;
      const secondInput = { ...firstInput, requestId: randomUUID(), operationId: randomUUID() };
      const first = commands(participants[0], holdCommit).submit.execute(firstInput).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, reason: error }),
      );
      void first.then((result) => { if (!announced) ready.reject(result.status === "rejected" ? result.reason : new Error("Admission submission commit barrier failed: completed_effects_unavailable")); });
      let second: Promise<PromiseSettledResult<unknown>> | undefined;
      let observationError: unknown;
      try {
        const scope = await ready.promise;
        let secondFinished = false;
        let secondRequestId: string | null = null;
        second = commands(participants[1]).submit.execute(secondInput).then(
          (value) => {
            secondFinished = true;
            if (value.ok && value.value.state === OPERATION_STATE.completed) secondRequestId = value.value.result.admissionRequestId;
            return { status: "fulfilled" as const, value };
          },
          (error: unknown) => { secondFinished = true; return { status: "rejected" as const, reason: error }; },
        );
        const blocked = await database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`select set_config('statement_timeout',${ADMISSION_SUBMISSION_CONCURRENCY_TEST.statementTimeout},true)`);
          for (;;) {
            await transaction.execute(sql`select pg_stat_clear_snapshot()`);
            const current = (await transaction.execute<{ blocked: boolean; live: boolean }>(sql`select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and ${scope.pid}=any(pg_blocking_pids(pid))) as blocked,clock_timestamp()<${scope.deadline}::timestamptz as live`)).rows[0];
            if (current.blocked) return true;
            if (secondFinished) return false;
            if (!current.live) throw new Error("Admission submission commit observer failed: native_deadline_exceeded");
            await transaction.execute(sql`select pg_sleep(${ADMISSION_SUBMISSION_CONCURRENCY_TEST.observationPauseSeconds})`);
          }
        });
        expect(blocked).toBe(false);
        expect(await second).toMatchObject({ status: "fulfilled", value: { ok: true, value: { state: OPERATION_STATE.completed, result: { outcome: ADMISSION_OUTCOME.admitted } } } });
        expect(secondRequestId).toBeTypeOf("string");
        const visible = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string }>(sql`select id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id in (${participants[0].userId},${participants[1].userId})`)).rows);
        expect(visible).toEqual([{ id: secondRequestId }]);
      } catch (error) { observationError = error; }
      finally { released.resolve(); }
      const [firstResult] = await Promise.all([first, second]);
      expect(firstResult).toMatchObject({ status: "fulfilled", value: { ok: true, value: { state: OPERATION_STATE.completed, result: { outcome: ADMISSION_OUTCOME.admitted } } } });
      if (observationError) throw observationError;
      const persisted = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ requests: number; members: number; decisions: number; effects: number }>(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id in (${participants[0].userId},${participants[1].userId}) and status=${ADMISSION_REQUEST_STATUS.approved}) as requests,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id in (${participants[0].userId},${participants[1].userId})) as members,(select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and user_id in (${participants[0].userId},${participants[1].userId})) as decisions,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId} and user_id in (${participants[0].userId},${participants[1].userId}) and applied_at is not null) as effects`)).rows[0]);
      expect(persisted).toEqual({ requests: 2, members: 2, decisions: 2, effects: 2 });
      const duplicateInputs = Array.from({ length: ADMISSION_SUBMISSION_CONCURRENCY_TEST.duplicateCommandCount }, () => ({ ...firstInput, requestId: randomUUID(), operationId: randomUUID() }));
      const duplicates = await Promise.all(duplicateInputs.map((input) => commands(participants[2]).submit.execute(input)));
      const outcomes = duplicates.map((result) => {
        expect(result).toMatchObject({ ok: true, value: { state: OPERATION_STATE.completed } });
        if (!result.ok || result.value.state !== OPERATION_STATE.completed) throw new Error("Concurrent admission submission failed: duplicate_original_unconfirmed");
        return result.value.result.outcome;
      });
      expect(outcomes.filter((outcome) => outcome === ADMISSION_OUTCOME.admitted)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome === ADMISSION_OUTCOME.alreadyMember)).toHaveLength(ADMISSION_SUBMISSION_CONCURRENCY_TEST.duplicateCommandCount - 1);
      await database.withContext(fixture.own, async (transaction) => {
        const unique = (await transaction.execute<{ requests: number; members: number; decisions: number; effects: number }>(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${participants[2].userId}) as requests,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${participants[2].userId}) as members,(select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and user_id=${participants[2].userId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId} and user_id=${participants[2].userId} and applied_at is not null) as effects`)).rows[0];
        expect(unique).toEqual({ requests: 1, members: 1, decisions: 1, effects: 1 });
      });
    }, { concurrentTransactions: ADMISSION_SUBMISSION_CONCURRENCY_TEST.concurrentTransactions });
  }, ADMISSION_SUBMISSION_CONCURRENCY_TEST.timeoutMs);
});
