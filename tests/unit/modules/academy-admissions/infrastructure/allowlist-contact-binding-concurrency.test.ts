/** @vitest-environment node */
/** Exercises two native accounts presenting one genuinely verified phone contact under observed PostgreSQL contention. @module allowlist-contact-binding-concurrency-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native concurrent allowlist contact ownership", () => {
  it("should commit one owner and member, retain the competing proof and preserve binding after disabling the entry", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true), entryId = randomUUID();
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql"]) await database.applyMigration(migration);
      const other = { userId: randomUUID(), sessionId: randomUUID(), accountId: randomUUID(), subject: randomUUID(), email: `other.${randomUUID()}@example.test` };
      await database.withContext(fixture.fixture.own, async (transaction) => {
        const fingerprint = await createAdmissionContactFingerprint(fixture.input.contact, fixture.fixture.config);
        await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,origin,created_by_user_id,updated_by_user_id) values (${entryId},${fixture.context.tribeId},'phone',${fixture.input.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'Misma habilitación','manual',${fixture.fixture.userId},${fixture.fixture.userId})`);
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${other.userId},'Other synthetic applicant',${other.email},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${other.accountId},${other.userId},'google',${other.subject},clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${other.sessionId},${other.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${other.sessionId},${other.userId},${other.accountId},${other.subject},${other.email})`);
      });
      const participants = [fixture.context, { ...fixture.context, userId: other.userId, sessionId: other.sessionId, requestId: randomUUID() }];
      const presentations = [];
      for (const participant of participants) {
        const own = { userId: participant.userId, email: participant.userId === fixture.context.userId ? fixture.own.email : other.email };
        const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(own, run), async () => fixture.fixture.config);
        const issued = await operations.issue({ ...fixture.input, ...participant, operationId: randomUUID(), expectedPolicyVersion: 2 });
        if (issued.state !== "completed") throw new Error("Expected native shared-contact issuance");
        const scope = { ...fixture.fixture.scope, userId: participant.userId, contact: fixture.input.contact, verificationEpoch: 2 };
        const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own, scope }, issued.result.challengeId);
        const verified = await operations.verify({ ...participant, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
        if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Expected native verified shared-contact proof");
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: participant.userId, sessionId: participant.sessionId }), (_identity, run) => database.withContext(own, run));
        const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
        presentations.push({ participant, commands, input: { tribeId: participant.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, proofId: verified.result.proofId, phone: fixture.input.contact.value, country: "AR" } });
      }
      expect(await database.withContext(fixture.fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}`)).rows)).toEqual([{ count: 0 }]);
      const horizon = await database.withContext(fixture.fixture.own, async (transaction) => (await transaction.execute<{ deadline: string }>(sql`select clock_timestamp()+interval '60 seconds' as deadline`)).rows[0].deadline);
      let announceLock!: (pid: number) => void, rejectLock!: (error: unknown) => void, releaseLock!: () => void;
      const locked = new Promise<number>((resolve, reject) => { announceLock = resolve; rejectLock = reject; }), released = new Promise<void>((resolve) => { releaseLock = resolve; });
      const holder = database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`set local statement_timeout='10s'`);
        await transaction.execute(sql`select id from public.tribes where id=${fixture.context.tribeId} for update`);
        announceLock((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
        let releasedNow = false;
        void released.then(() => { releasedNow = true; });
        // Exercise the existing idle guard rather than disabling it: this
        // test-owned barrier remains active until both lock waits are observed.
        while (!releasedNow) {
          const current = (await transaction.execute<{ live: boolean }>(sql`select clock_timestamp()<${horizon}::timestamptz as live,pg_sleep(0.1)`)).rows[0];
          if (!current.live) throw new Error("Native contact contention barrier exceeded its independent deadline");
        }
      });
      void holder.catch(rejectLock);
      const holderPid = await locked;
      const submitted = Promise.all(presentations.map((presentation) => presentation.commands.submit.execute(presentation.input)));
      let primaryError: unknown;
      try {
        const contending = await database.withContext(fixture.fixture.own, async (transaction) => {
          await transaction.execute(sql`set local statement_timeout='10s'`);
          for (let attempt = 0; attempt < 150; attempt++) {
            await transaction.execute(sql`select pg_stat_clear_snapshot()`);
            const row = (await transaction.execute<{ waiting: number; live: boolean }>(sql`with recursive blocked(pid) as (select pid from pg_stat_activity where wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(pid)) union select activity.pid from pg_stat_activity activity join blocked blocker on blocker.pid=any(pg_blocking_pids(activity.pid)) where activity.wait_event_type='Lock') select count(*)::int as waiting,clock_timestamp()<${horizon}::timestamptz as live from blocked`)).rows[0];
            if (row.waiting >= 2) return true;
            if (!row.live) throw new Error("Native contact contention observation exceeded its independent deadline");
            await transaction.execute(sql`select pg_sleep(0.05)`);
          }
          return false;
        });
        expect(contending).toBe(true);
      } catch (error) { primaryError = error; }
      releaseLock();
      const [holderResult, submissionResult] = await Promise.allSettled([holder, submitted]);
      const cleanupErrors = [holderResult, submissionResult].filter((result) => result.status === "rejected").map((result) => result.reason);
      if (primaryError !== undefined) {
        if (cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors], "Native contact contention failed and cleanup reported an additional failure", { cause: primaryError });
        throw primaryError;
      }
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Native contact contention cleanup failed", { cause: cleanupErrors[0] });
      if (submissionResult.status !== "fulfilled") throw new Error("Native contact presentations did not settle successfully");
      const results = submissionResult.value;
      const winnerIndex = results.findIndex((result) => result.ok && result.value.state === "completed" && result.value.result.outcome === "admitted");
      expect(winnerIndex).toBeGreaterThanOrEqual(0);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const winner = presentations[winnerIndex], loser = presentations[1 - winnerIndex];
      expect(results[1 - winnerIndex]).toMatchObject({ ok: false, failure: { code: "contact_binding_conflict", operation: { operationId: loser.input.operationId, state: "completed" } } });
      expect(await loser.commands.submit.execute(loser.input)).toMatchObject({ ok: false, failure: { code: "contact_binding_conflict", operation: { state: "completed" } } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select owner_user_id,first_proof_id from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ owner_user_id: winner.participant.userId, first_proof_id: winner.input.proofId }]);
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${loser.input.proofId}`)).rows).toEqual([{ status: "available", applied_request_id: null }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.context.tribeId} and role='tribemate'`)).rows).toEqual([{ count: 1 }]);
        await transaction.execute(sql`update public.academy_allowlist_entries set status='disabled',version=version+1 where id=${entryId}`);
        expect((await transaction.execute(sql`select owner_user_id from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ owner_user_id: winner.participant.userId }]);
        expect((await transaction.execute(sql`select status from public.tribe_members where tribe_id=${fixture.context.tribeId} and user_id=${winner.participant.userId}`)).rows).toEqual([{ status: "active" }]);
      });
    }, { concurrentTransactions: 6 });
  }, 1_200_000);
});
