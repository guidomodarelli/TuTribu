/** @vitest-environment node */
/** Checks the native principal before owner locks while retaining real submission effects. */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { createAdmissionStatementObserver, observeAdmissionDatabase } from "@/tests/support/admission-database-observation";
import { ADMISSION_NATIVE_LEDGER_GUARD_TEST as SETTINGS } from "@/tests/support/constants/admission-native-ledger-guard";
import { ADMISSION_AUTHORIZATION_TEST } from "@/tests/support/constants/admission-authorization";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { SubmitAdmissionUseCase } from "@/src/modules/academy-admissions/application/use-cases/submit-admission-use-case";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { PostgresAdmissionAuthorizationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-authorization-reader";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { lockAcademyAdmissionMembershipScope } from "@/src/modules/tribes/infrastructure/repositories/lock-academy-admission-membership-scope";
import { ADMISSION_ACTION, ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native ledger authorization projection", () => {
  it("should save one round trip per guard while preserving pending effects and original replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      const participants = [await applicant(), await applicant()];
      /** @param participant - Real independent persisted account/session. @param batchNativeSubmissionAuthorization - Trusted composition capability, never browser input. @returns Actual command and execution observation, without driver doubles. */
      const createSubmission = (participant: typeof participants[number], batchNativeSubmissionAuthorization: boolean) => {
        const observer = createAdmissionStatementObserver();
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: participant.userId, sessionId: participant.sessionId }), (_identity, run) => database.withContext({ userId: participant.userId, email: null }, run));
        const writer = new PostgresAdmissionRequestRepository((scope, run) => database.withContext({ userId: scope.userId, email: null }, (transaction) => run(observeAdmissionDatabase(transaction, observer))), async () => fixture.config, (transaction) => ({
          memberships: createAcademyApprovedMembershipWriter(transaction),
          notifications: createPostgresAdmissionNotificationObligationWriter(transaction),
          lockSubmissionScope: (scope) => lockAcademyAdmissionMembershipScope(transaction, scope.tribeId, scope.userId),
          readSubmissionActor: (scope) => new PostgresAdmissionAuthorizationReader(transaction, scope.sessionId, ADMISSION_ACTION.readOwnRequest).getCurrentActorWithSubmissionScope(scope.tribeId, scope.userId),
        }), { batchNativeSubmissionAuthorization });
        return { command: new SubmitAdmissionUseCase(accounts, writer, () => new Date()), observer };
      };
      const reference = createSubmission(participants[0], false), grouped = createSubmission(participants[1], true);
      const referenceInput = { ...participants[0].input, message: "Solicitud controlada de revisión" };
      const groupedInput = { ...participants[1].input, message: "Solicitud controlada de revisión" };
      const originalReference = await reference.command.execute(referenceInput), originalGrouped = await grouped.command.execute(groupedInput);
      const referenceObserved = reference.observer.snapshot(), groupedObserved = grouped.observer.snapshot();
      expect(originalReference).toMatchObject({ ok: true, value: { state: OPERATION_STATE.completed, result: { outcome: ADMISSION_OUTCOME.pending } } });
      expect(originalGrouped).toMatchObject({ ok: true, value: { state: OPERATION_STATE.completed, result: { outcome: ADMISSION_OUTCOME.pending } } });
      expect(referenceObserved.statementCount - groupedObserved.statementCount).toBe(SETTINGS.authorizationCallsPerSubmission);
      expect(referenceObserved.pendingStatements).toBe(0); expect(groupedObserved.pendingStatements).toBe(0);
      const replay = await grouped.command.execute(groupedInput);
      expect(replay).toMatchObject({ ok: true, value: { state: OPERATION_STATE.completed, replayed: true } });
      if (!originalGrouped.ok || originalGrouped.value.state !== OPERATION_STATE.completed || !replay.ok || replay.value.state !== OPERATION_STATE.completed) throw new Error("Native ledger guard validation failed: committed_snapshot_unavailable");
      expect(replay.value.result).toEqual(originalGrouped.value.result);
      const participantIds = participants.map((participant) => sql`${participant.userId}`);
      const stock = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}) as bindings,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id in (${sql.join(participantIds, sql`, `)})) as members,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
      expect(stock).toEqual({ requests: participants.length, bindings: participants.length, members: 0, deliveries: 0 });
    }, { concurrentTransactions: SETTINGS.concurrentTransactions });
  }, SETTINGS.timeoutMs);

  it("should reject a foreign native actor before the held tribe fence or any security-config read", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database), participant = await applicant();
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: participant.userId, sessionId: participant.sessionId }), (_identity, run) => database.withContext({ userId: participant.userId, email: null }, run));
      let securityReads = 0;
      const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (_account, run) => database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select set_config(${ADMISSION_AUTHORIZATION_TEST.statementTimeoutSetting},${String(ADMISSION_AUTHORIZATION_TEST.mismatchStatementTimeoutMs)},true)`);
        return run(transaction);
      }) }).createManualRequestModule({ readSecurityConfig: async () => { securityReads += 1; return fixture.config; } }).useCases;
      let announceHeld!: () => void, rejectHeld!: (error: unknown) => void, releaseHeld!: () => void;
      const held = new Promise<void>((resolve, reject) => { announceHeld = resolve; rejectHeld = reject; });
      const released = new Promise<void>((resolve) => { releaseHeld = resolve; });
      const holder = database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        announceHeld();
        await released;
      });
      void holder.catch(rejectHeld);
      await held;
      const result = await (async () => {
        try { return await commands.submit.execute({ ...participant.input, message: "Solicitud controlada de revisión" }); }
        finally { releaseHeld(); await holder; }
      })();
      expect(result).toMatchObject({ ok: false, failure: { code: ADMISSION_ERROR_CODE.permissionDenied } });
      expect(securityReads).toBe(0);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows)).toEqual([]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_requests where tribe_id=${fixture.tribeId}`)).rows)).toEqual([]);
    }, { concurrentTransactions: SETTINGS.concurrentTransactions });
  }, SETTINGS.timeoutMs);
});
