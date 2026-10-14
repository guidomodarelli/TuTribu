/** @vitest-environment node */
/** Exercises the real migration command and its replay exclusively on an owned database branch. @module admission-feature-migration-sequence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { executeAdmissionMigrationCommand } from "@/tests/support/admission-migration-command";
import { buildAdmissionExpirationModule } from "@/src/modules/academy-admissions/setup";
import { PostgresMessageDispatchRunRecorder } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-dispatch-run-recorder";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("complete admission migration sequence", () => {
  it("should apply the real registered feature sequence once and preserve physical retirement protection on replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const before = await database.withContext({ userId: null, email: null }, async (transaction) => ({
        history: (await transaction.execute<{ total: number; latest: string }>(sql`select count(*)::int as total,max(created_at)::text as latest from drizzle.__drizzle_migrations`)).rows[0],
        featureAbsent: (await transaction.execute<{ absent: boolean }>(sql`select to_regclass('public.academy_admission_policies') is null as absent`)).rows[0].absent,
      }));
      expect(before.featureAbsent).toBe(true);
      // The branch guard supplies both URLs in memory. The child process's
      // initial environment wins over development files in @next/env.
      await database.withServerEnvironment(async (environment) => {
        /** Runs the actual npm-script entrypoint without printing transport or driver output. @returns Nothing after a successful bounded migration process. */
        const migrate = () => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL });
        await migrate();
        const applied = await database.withContext({ userId: null, email: null }, async (transaction) => {
          expect((await transaction.execute(sql`select to_regclass('public.academy_admission_retired_bindings') is not null and to_regclass('public.academy_admission_retired_operations') is not null and to_regclass('public.academy_admission_retired_audit_events') is not null as ready`)).rows).toEqual([{ ready: true }]);
          return (await transaction.execute<{ total: number; latest: string }>(sql`select count(*)::int as total,max(created_at)::text as latest from drizzle.__drizzle_migrations`)).rows[0];
        });
        expect(applied.total - before.history.total).toBe(66);
        expect(BigInt(applied.latest) > BigInt(before.history.latest)).toBe(true);
        await migrate();
        await database.withContext({ userId: null, email: null }, async (transaction) => {
          expect((await transaction.execute(sql`select count(*)::int as total,max(created_at)::text as latest from drizzle.__drizzle_migrations`)).rows).toEqual([applied]);
        });
      });
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        expect((await transaction.execute(sql`select to_regprocedure('public.claim_expired_messaging_candidates(integer)') is not null as candidate_owner_ready`)).rows).toEqual([{ candidate_owner_ready: true }]);
        expect((await transaction.execute(sql`select * from public.claim_expired_messaging_candidates(1)`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select * from public.purge_expired_allowlist_import_material(1)`)).rows).toEqual([{ purged_rows: 0, completed_imports: 0 }]);
      });
      const userId = randomUUID(), tribeId = randomUUID(), requestId = randomUUID();
      const context = { userId, email: `${userId}@example.test` };
      await database.withContext(context, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${userId},'Synthetic migration owner',${context.email},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values(${tribeId},'Synthetic migrated tribe',${`migrated-${tribeId}`},${userId})`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,changed_by_user_id) values (${tribeId},${userId})`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${requestId},${tribeId},${userId},'common','none','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,transaction_timestamp()-interval '31 days',transaction_timestamp()-interval '1 day')`);
      });
      const expiration = buildAdmissionExpirationModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async () => true });
      const recorder = new PostgresMessageDispatchRunRecorder((actor, run) => database.withContext({ userId: actor, email: null }, run), async () => true, async () => ({ environment: "synthetic-migration", securityEpoch: randomUUID(), recoveryLocked: false }));
      const observationEpoch = randomUUID();
      const stableRecorder = new PostgresMessageDispatchRunRecorder((actor, run) => database.withContext({ userId: actor, email: null }, run), async () => true, async () => ({ environment: "synthetic-migration", securityEpoch: observationEpoch, recoveryLocked: false }));
      await expect(recorder.finish(await stableRecorder.begin(randomUUID()), [], [], 45_000)).rejects.toMatchObject({ code: "connection_incomplete" });
      const observed = await stableRecorder.begin(randomUUID());
      await stableRecorder.finish(observed, [{ tribeId, outcome: "completed", counters: { claimed: 0, authorized: 0, accepted: 0, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false } }], [{ sampleId: randomUUID(), tribeId, phase: "claim", durationMs: 7 }], 45_000);
      await database.withContext(context, async (transaction) => {
        expect((await transaction.execute(sql`select outcome,counters->>'claimed' as claimed from public.messaging_dispatch_runs where run_id=${observed.runId} and tribe_id=${tribeId}`)).rows).toEqual([{ outcome: "completed", claimed: "0" }]);
        expect((await transaction.execute(sql`select phase,duration_ms::integer as duration from public.messaging_dispatch_phase_samples where run_id=${observed.runId} and tribe_id=${tribeId}`)).rows).toEqual([{ phase: "claim", duration: 7 }]);
      });
      expect(await expiration.useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 1 });
      expect(await expiration.useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 0 });
      await database.withContext(context, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "expired", version: 2 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select event.metadata,event.created_at=decision.decided_at as owner_clock from public.academy_admission_audit_events event join public.academy_admission_decisions decision on decision.id=(event.metadata->>'decisionId')::uuid and decision.tribe_id=event.tribe_id where event.resource_id=${requestId} and event.event_type='expired'`)).rows).toEqual([{metadata:{fromStatus:"pending",toStatus:"expired",previousVersion:1,policyVersion:1,verificationEpoch:1,proofId:null,decisionId:expect.any(String),invitationId:null},owner_clock:true}]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.notifications where tribe_id=${tribeId} and type='admission_expired'`)).rows).toEqual([{ count: 1 }]);
        const notices=(await transaction.execute<{event_type:string;actor_user_id:string|null;operation_id:string|null;resource_version:number|null;metadata:{obligationId:string;requestId:string;sourceEvent:string;audience:string|null;durationMs:number|null}}>(sql`select event_type,actor_user_id,operation_id,resource_version,metadata from public.academy_admission_audit_events where tribe_id=${tribeId} and resource_type='admission_notification' order by created_at,id`)).rows;
        expect(notices).toHaveLength(2);expect(new Set(notices.map((event)=>event.event_type))).toEqual(new Set(["notification_obligation_created","notification_materialized"]));
        expect(notices.every((event)=>event.actor_user_id===null&&event.operation_id===null&&event.resource_version===null&&event.metadata.requestId===requestId&&event.metadata.sourceEvent==="expired")).toBe(true);
      });
      await expect(database.withContext(context, async (transaction) => {
        await transaction.execute(sql`delete from public.tribes where id=${tribeId}`);
        throw new Error("Controlled complete-sequence retirement rollback");
      })).rejects.toThrow("Controlled complete-sequence retirement rollback");
      await database.withContext(context, async (transaction) => {
        expect((await transaction.execute(sql`select retired_at is null as active from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`)).rows).toEqual([{ active: true }]);
        await transaction.execute(sql`delete from public.tribes where id=${tribeId}`);
      });
      await database.withContext(context, async (transaction) => {
        expect((await transaction.execute(sql`select retired_at is not null as retired from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`)).rows).toEqual([{ retired: true }]);
        const notices=(await transaction.execute<{actor_reference_id:string|null;operation_id:string|null;metadata:{requestId:string;sourceEvent:string}}>(sql`select actor_reference_id,operation_id,metadata from public.academy_admission_retired_audit_events where tribe_id=${tribeId} and resource_type='admission_notification'`)).rows;
        expect(notices).toHaveLength(2);expect(notices.every((event)=>event.actor_reference_id===null&&event.operation_id===null&&event.metadata.requestId===requestId&&event.metadata.sourceEvent==="expired")).toBe(true);
      });
      await expect(database.withContext(context, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values(${tribeId},'Synthetic reused tribe',${`reused-${tribeId}`},${userId})`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, 1_200_000);
});
