/** @vitest-environment node */
/** Exercises real paid notification authority and actor deletion on an owned PostgreSQL branch. @module paid-admission-notification-audit-tests */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalPaidMembership } from "@/tests/support/personal-paid-membership-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import { recoverProtectedSubscriptionMemberships } from "@/src/modules/subscriptions/infrastructure/repositories/subscription-membership-source-writer";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native paid admission notification audit", () => {
  it("should complete paid recovery while a different managerial actor is physically deleted without a user/member lock cycle", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const managerId = randomUUID(), manager = { userId: managerId, email: null };
      const scenario = await preparePersonalPaidMembership(database, undefined, "muted", async (tribeId) => {
        await database.withContext(manager, async (transaction) => {
          await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${managerId},'Synthetic payment manager',${`${managerId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${managerId},'guardian','active')`);
        });
      }), { fixture, recipient } = scenario;
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);
        await transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.tribeId} and user_id=${managerId}`);
      });
      await database.withServerEnvironment(async (environment) => {
        const deleter = new Client({ connectionString: environment.DATABASE_MAINTENANCE_URL });
        const observer = new Client({ connectionString: environment.DATABASE_MAINTENANCE_URL });
        let announceSource!: (pid: number) => void, rejectSource!: (error: unknown) => void, releaseSource!: () => void;
        const sourceReady = new Promise<number>((resolve, reject) => { announceSource = resolve; rejectSource = reject; });
        const sourceReleased = new Promise<void>((resolve) => { releaseSource = resolve; });
        let recovery: Promise<number> | undefined, deletion: Promise<unknown> | undefined;
        try {
          await Promise.all([deleter.connect(), observer.connect()]);
          await deleter.query("BEGIN");
          await deleter.query("set local statement_timeout='30s'");
          await observer.query("set statement_timeout='10s'");
          const deletionPid = (await deleter.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
          recovery = database.withContext(manager, async (transaction) => {
            await transaction.execute(sql`set local statement_timeout='30s'`);
            await transaction.execute(sql`update public.tribe_member_subscriptions set status='active',updated_at=clock_timestamp() where id=${scenario.subscriptionId}`);
            return recoverProtectedSubscriptionMemberships(transaction, { providerSubscriptionIds: [scenario.providerId], tribeSlug: scenario.slug }, (owner) => ({
              async resolvePaidMembership(scope) {
                announceSource((await owner.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
                await sourceReleased;
                await createPaidAdmissionResolutionWriter(owner).resolvePaidMembership(scope);
              },
            }));
          });
          void recovery.then(() => rejectSource(new Error("Paid recovery ended before reaching its actual resolution collaborator")), rejectSource);
          const sourcePid = await sourceReady;
          deletion = deleter.query('delete from public."user" where id=$1', [managerId]).then(async (result) => { await deleter.query("COMMIT"); return result; });
          void deletion.catch(() => {});
          const horizon = (await observer.query<{ deadline: string }>("select (clock_timestamp()+interval '15 seconds')::text as deadline")).rows[0].deadline;
          let deletionBlockedBySource = false;
          while (!deletionBlockedBySource) {
            const observation = (await observer.query<{ blocked: boolean; live: boolean }>("select $1=any(pg_blocking_pids($2)) as blocked,clock_timestamp()<$3::timestamptz as live", [sourcePid, deletionPid, horizon])).rows[0];
            deletionBlockedBySource = observation.blocked;
            if (!observation.live) throw new Error("Paid actor deletion did not reach its native row wait before the observation deadline");
            if (!deletionBlockedBySource) await observer.query("select pg_sleep(0.05)");
          }
          releaseSource();
          const results = await Promise.allSettled([recovery, deletion]);
          const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
          if (failures.length) throw new AggregateError(failures, "Paid recovery and actor deletion failed their native concurrency contract");
          expect(results[0]).toMatchObject({ status: "fulfilled", value: 1 });
        } finally {
          releaseSource();
          await Promise.allSettled([...(recovery ? [recovery] : []), ...(deletion ? [deletion] : [])]);
          await deleter.query("ROLLBACK");
          await Promise.allSettled([deleter.end(), observer.end()]);
        }
      });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${scenario.requestId}`)).rows).toEqual([{ status: "cancelled", cancel_reason: "external_resolution" }]);
        expect((await transaction.execute(sql`select status from public.tribe_members where id=${scenario.originalMember.id}`)).rows).toEqual([{ status: "muted" }]);
        expect((await transaction.execute(sql`select event_type,actor_user_id,operation_id,resource_version,metadata->>'sourceEvent' as source_event from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification' and metadata->>'sourceEvent'='cancelled' order by event_type`)).rows).toEqual([
          { event_type: "notification_materialized", actor_user_id: null, operation_id: null, resource_version: null, source_event: "cancelled" },
          { event_type: "notification_obligation_created", actor_user_id: null, operation_id: null, resource_version: null, source_event: "cancelled" },
        ]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public."user" where id=${managerId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.notifications where recipient_user_id=${recipient.userId} and type='admission_cancelled'`)).rows).toEqual([{ total: 1 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should allow the real receipt-scoped writer under NOBYPASSRLS while rejecting an invented receipt", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const scenario = await preparePersonalPaidMembership(database), { fixture, recipient } = scenario;
      const effectId = await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.tribe_member_subscriptions set status='active',updated_at=clock_timestamp() where id=${scenario.subscriptionId}`);
        expect(await recoverProtectedSubscriptionMemberships(transaction, { providerSubscriptionIds: [scenario.providerId] }, () => ({ async resolvePaidMembership() {} }))).toBe(1);
        return (await transaction.execute<{ id: string }>(sql`select id from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows[0].id;
      });
      const scope = { membershipEffectId: effectId, tribeId: fixture.tribeId, userId: recipient.userId };
      await expect(database.withContext(fixture.own, (transaction) => createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership({ ...scope, membershipEffectId: randomUUID() }), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await database.withContext(fixture.own, (transaction) => createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership(scope), "non_bypass");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${scenario.requestId}`)).rows).toEqual([{ status: "cancelled", cancel_reason: "external_resolution" }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification' and metadata->>'sourceEvent'='cancelled'`)).rows).toEqual([{ total: 2 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it.each(["source", "standalone"] as const)("should finish %s after an earlier creator deletion rolls back its real FK restriction without a tribe/user cycle", async (entrypoint) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const scenario = await preparePersonalPaidMembership(database), { fixture, recipient } = scenario;
      const effectId = entrypoint === "standalone" ? await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.tribe_member_subscriptions set status='active',updated_at=clock_timestamp() where id=${scenario.subscriptionId}`);
        expect(await recoverProtectedSubscriptionMemberships(transaction, { providerSubscriptionIds: [scenario.providerId] }, () => ({ async resolvePaidMembership() {} }))).toBe(1);
        return (await transaction.execute<{ id: string }>(sql`select id from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows[0].id;
      }) : null;
      await database.withServerEnvironment(async (environment) => {
        const deleter = new Client({ connectionString: environment.DATABASE_MAINTENANCE_URL });
        const observer = new Client({ connectionString: environment.DATABASE_MAINTENANCE_URL });
        let announceSource!: (pid: number) => void, rejectSource!: (error: unknown) => void;
        const sourceReady = new Promise<number>((resolve, reject) => { announceSource = resolve; rejectSource = reject; });
        let recovery: Promise<void> | undefined;
        try {
          await Promise.all([deleter.connect(), observer.connect()]);
          await deleter.query("BEGIN");
          await deleter.query("set local statement_timeout='30s'");
          await deleter.query('select id from public."user" where id=$1 for update', [fixture.userId]);
          const deletionPid = (await deleter.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
          recovery = database.withContext(fixture.own, async (transaction) => {
            await transaction.execute(sql`set local statement_timeout='30s'`);
            announceSource((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
            if (entrypoint === "standalone" && effectId) {
              await createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership({ membershipEffectId: effectId, tribeId: fixture.tribeId, userId: recipient.userId });
            } else {
              await transaction.execute(sql`update public.tribe_member_subscriptions set status='active',updated_at=clock_timestamp() where id=${scenario.subscriptionId}`);
              expect(await recoverProtectedSubscriptionMemberships(transaction, { providerSubscriptionIds: [scenario.providerId] }, createPaidAdmissionResolutionWriter)).toBe(1);
            }
          }, entrypoint === "standalone" ? "non_bypass" : "runtime");
          void recovery.catch(rejectSource);
          const sourcePid = await sourceReady;
          const horizon = (await observer.query<{ deadline: string }>("select (clock_timestamp()+interval '15 seconds')::text as deadline")).rows[0].deadline;
          let sourceBlockedByDeletion = false;
          while (!sourceBlockedByDeletion) {
            const observation = (await observer.query<{ blocked: boolean; live: boolean }>("select $1=any(pg_blocking_pids($2)) as blocked,clock_timestamp()<$3::timestamptz as live", [deletionPid, sourcePid, horizon])).rows[0];
            sourceBlockedByDeletion = observation.blocked;
            if (!observation.live) throw new Error("Paid source did not reach the earlier account lock before the observation deadline");
            if (!sourceBlockedByDeletion) await observer.query("select pg_sleep(0.05)");
          }
          await expect(deleter.query('delete from public."user" where id=$1', [fixture.userId])).rejects.toMatchObject({ code: "23503", constraint: "tribes_created_by_fkey" });
          await deleter.query("ROLLBACK");
          await recovery;
        } finally {
          await deleter.query("ROLLBACK");
          await Promise.allSettled(recovery ? [recovery] : []);
          await Promise.allSettled([deleter.end(), observer.end()]);
        }
      });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${scenario.requestId}`)).rows).toEqual([{ status: "cancelled", cancel_reason: "external_resolution" }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification' and actor_user_id=${fixture.userId} and metadata->>'sourceEvent'='cancelled'`)).rows).toEqual([{ total: 2 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
