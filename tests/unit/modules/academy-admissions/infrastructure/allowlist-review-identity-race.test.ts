/** @vitest-environment node */
/** Exercises native identity supersession at the actual approval boundary with observable PostgreSQL locks. @module allowlist-review-identity-race-tests */
import { randomInt, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresGlobalIdentityEvidenceRepository } from "@/src/modules/auth/infrastructure/repositories/postgres-global-identity-evidence-repository";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native allowlist reviewer identity concurrency", () => {
  it("should deny a waiting approval after the applicant's native account capture supersedes its original evidence", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      const applicant = await createApplicant();
      const submitted = await applicant.commands.submit.execute({ ...applicant.input, message: "Solicito revisión con mi captura original." });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Waiting identity review did not produce its own pending request");
      const requestId = submitted.value.result.admissionRequestId, version = submitted.value.result.committedRequestVersion!;
      expect(await fixture.writer.create({ context: await fixture.confirm("create_allowlist_entry"), operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, displayName: null })).toMatchObject({ state: "completed" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,version,submitted_at,expires_at,global_identity_evidence_id from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      const result = await withAdmissionTransitionContention(database, { userId: applicant.userId, email: applicant.email }, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        const identity = new PostgresGlobalIdentityEvidenceRepository((run) => run(transaction));
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        expect(await identity.capture({ userId: applicant.userId, accountId: applicant.accountId, sessionId: applicant.sessionId, evidence: { subject: applicant.subject, normalizedEmail: applicant.email, emailVerifiedClaim: true, hostedDomain: "example.test", classification: "workspace", issuer: "https://accounts.google.com", audience: "synthetic-list-client", tokenIssuedAt: now, tokenExpiresAt: new Date(now.getTime()+3_600_000) } })).toMatchObject({ status: "stored" });
      }, () => leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: version, confirmed: true, decision: "approve", internalReason: "Revisión de captura que cambió durante la espera", externalMessage: null }));
      const safeOutcome = result.status === "fulfilled" ? result.value.ok ? `success:${result.value.value.state}` : `denied:${result.value.failure.code}` : "rejected";
      expect(result, `Waiting identity approval produced ${safeOutcome}`).toMatchObject({ status: "fulfilled", value: { ok: false, failure: { code: "admission_ineligible" } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,submitted_at,expires_at,global_identity_evidence_id from public.academy_admission_requests where id=${requestId}`)).rows[0]).toEqual(before);
        expect((await transaction.execute(sql`select invalidated_at is not null as invalidated,invalidation_reason from public.global_identity_evidence where id=${applicant.evidenceId}`)).rows[0]).toEqual({ invalidated: true, invalidation_reason: "superseded_capture" });
        const effects = (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${requestId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as memberships,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as membership_effects`)).rows[0];
        expect(effects).toEqual({ decisions: 0, memberships: 0, membership_effects: 0 });
      });
    }, { concurrentTransactions: 4 });
  }, 1_200_000);

  it("should serialize an original capture against native supersession until the explicit approval commits", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      const applicant = await createApplicant();
      const submitted = await applicant.commands.submit.execute({ ...applicant.input, message: "Solicito revisión." });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Expected genuine pending before identity race");
      const requestId = submitted.value.result.admissionRequestId, version = submitted.value.result.committedRequestVersion!;
      const context = await fixture.confirm("create_allowlist_entry");
      expect((await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, displayName: null })).state).toBe("completed");
      const barrierId = randomInt(1, 2_147_483_647);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`);
        await transaction.execute(sql`create function public.test_hold_identity_review() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(TG_ARGV[0]::bigint); return NEW; end; $$`);
        await transaction.execute(sql.raw(`create trigger test_identity_review_barrier before insert on public.academy_admission_decisions for each row execute function public.test_hold_identity_review('${barrierId}')`));
      });
      let announceHolder!: (pid: number) => void, releaseHolder!: () => void;
      const held = new Promise<number>((resolve) => { announceHolder = resolve; });
      const release = new Promise<void>((resolve) => { releaseHolder = resolve; });
      const holder = database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(${barrierId}::bigint)`);
        announceHolder((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
        await release;
      });
      const holderPid = await held;
      const approval = leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: version, confirmed: true, decision: "approve", internalReason: "Revisión con contacto acreditado", externalMessage: null });
      const observedApproval = approval.then((value) => ({ value }));
      let capture: Promise<Awaited<ReturnType<PostgresGlobalIdentityEvidenceRepository["capture"]>>> | undefined;
      let capturePid = 0;
      try {
        const approvalPid = await database.withContext(fixture.own, async (transaction) => {
          for (let attempt = 0; attempt < 200; attempt++) {
            await transaction.execute(sql`select pg_stat_clear_snapshot()`);
            const pending = (await transaction.execute<{ pid: number }>(sql`select pid from pg_stat_activity where wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(pid))`)).rows[0];
            if (pending) return pending.pid;
            await transaction.execute(sql`select pg_sleep(0.05)`);
          }
          throw new Error("Expected approval at genuine decision insertion barrier");
        });
        const identity = new PostgresGlobalIdentityEvidenceRepository((run) => database.withContext({ userId: applicant.userId, email: applicant.email }, async (transaction) => {
          await transaction.execute(sql`set local statement_timeout='15s'`);
          capturePid = (await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
          return run(transaction);
        }));
        const now = new Date();
        capture = identity.capture({ userId: applicant.userId, accountId: applicant.accountId, sessionId: applicant.sessionId,
          evidence: { subject: applicant.subject, normalizedEmail: applicant.email, emailVerifiedClaim: true, hostedDomain: "example.test", classification: "workspace", issuer: "https://accounts.google.com", audience: "synthetic-list-client", tokenIssuedAt: now, tokenExpiresAt: new Date(now.getTime() + 3_600_000) } });
        void capture.catch(() => undefined);
        const serialized = await database.withContext(fixture.own, async (transaction) => {
          for (let attempt = 0; attempt < 200; attempt++) {
            await transaction.execute(sql`select pg_stat_clear_snapshot()`);
            const current = (await transaction.execute<{ blocked: boolean; invalidated: boolean }>(sql`select exists(select 1 from pg_stat_activity where pid=${capturePid} and wait_event_type='Lock' and ${approvalPid}=any(pg_blocking_pids(pid))) as blocked,(select invalidated_at is not null from public.global_identity_evidence where id=${applicant.evidenceId}) as invalidated`)).rows[0];
            if (current.blocked) return true;
            if (current.invalidated) return false;
            await transaction.execute(sql`select pg_sleep(0.05)`);
          }
          throw new Error("Expected supersession completion or a genuine approval lock");
        });
        expect(serialized).toBe(true);
      } finally {
        releaseHolder();
        await holder;
        if (capture) await expect(capture).resolves.toMatchObject({ status: "stored" });
        await expect(observedApproval).resolves.toMatchObject({ value: { ok: true, value: { state: "completed", result: { status: "approved" } } } });
      }
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select evidence_snapshot->>'referenceId' as reference_id from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ reference_id: applicant.evidenceId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select invalidated_at is not null as invalidated from public.global_identity_evidence where id=${applicant.evidenceId}`)).rows).toEqual([{ invalidated: true }]);
      });
    }, { concurrentTransactions: 6 });
  }, 1_200_000);
});
