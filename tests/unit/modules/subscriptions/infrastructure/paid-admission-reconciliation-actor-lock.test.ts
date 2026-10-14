/** @vitest-environment node */
/** Exercises the complete payment repositories against an earlier creator deletion in native PostgreSQL. @module paid-admission-reconciliation-actor-lock-tests */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalPaidMembership } from "@/tests/support/personal-paid-membership-fixture";
import { createSubscriptionMembershipReconciliationRepository } from "@/tests/support/subscription-membership-reconciliation-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE } from "@/src/modules/subscriptions/constants/subscriptions";
import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native complete paid actor lifetime", () => {
  it.each(["price", "diagnostics", "member"] as const)("should finish the full %s repository after an earlier creator DELETE is rejected by its FK", async (entrypoint) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const scenario = await preparePersonalPaidMembership(database), { fixture } = scenario;
      await database.withServerEnvironment(async (environment) => {
        const deleter = new Client({ connectionString: environment.DATABASE_MAINTENANCE_URL });
        const observer = new Client({ connectionString: environment.DATABASE_MAINTENANCE_URL });
        const sourcePids = new Set<number>();
        let reconciliation: Promise<void> | undefined, sourceSettled = false;
        /** Observe only actual guarded executor checkouts; every query and repository remains real. */
        const observedDatabase: AcademyAdmissionTestDatabase = {
          ...database,
          withContext: (context, run, role) => database.withContext(context, async (transaction) => {
            sourcePids.add((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
            return run(transaction);
          }, role),
        };
        try {
          await Promise.all([deleter.connect(), observer.connect()]);
          await deleter.query("BEGIN");
          await deleter.query("set local statement_timeout='30s'");
          await deleter.query('select id from public."user" where id=$1 for update', [fixture.userId]);
          const deletionPid = (await deleter.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
          const own = { userId: fixture.userId, email: null };
          reconciliation = (async () => {
            if (entrypoint === "member") {
              const unexpected = async () => { throw new Error("Paid actor lifetime scenario unexpectedly invoked a provider mutation"); };
              const repository = new PostgresTribeMemberSubscriptionRepository((run) => observedDatabase.withContext(own, run), unexpected, unexpected, async () => "authorized", unexpected, unexpected, unexpected, createPaidAdmissionResolutionWriter, randomUUID());
              expect(await repository.handleWebhook({ eventId: randomUUID(), resourceId: scenario.providerId, topic: "subscription_preapproval" })).toMatchObject({ status: "processed" });
            } else {
              const repository = createSubscriptionMembershipReconciliationRepository(observedDatabase, own, "authorized");
              const result = entrypoint === "price"
                ? await repository.reconcileProviderSubscribers({ priceId: scenario.priceId, tribeSlug: scenario.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton })
                : await repository.reconcileSubscriberDiagnostics({ tribeSlug: scenario.slug });
              expect(result).toMatchObject({ status: "verified", verifiedCount: 1 });
            }
          })();
          void reconciliation.then(() => { sourceSettled = true; }, () => { sourceSettled = true; });
          const horizon = (await observer.query<{ deadline: string }>("select (clock_timestamp()+interval '15 seconds')::text as deadline")).rows[0].deadline;
          let sourceBlockedByDeletion = false;
          while (!sourceBlockedByDeletion) {
            const pids = [...sourcePids];
            if (pids.length) sourceBlockedByDeletion = (await observer.query<{ blocked: boolean }>("select exists(select 1 from unnest($1::integer[]) source(pid) where $2=any(pg_blocking_pids(source.pid))) as blocked", [pids, deletionPid])).rows[0].blocked;
            if (!sourceBlockedByDeletion) {
              if (sourceSettled) throw new Error("Complete paid repository ended before reaching the earlier creator lock");
              const live = (await observer.query<{ live: boolean }>("select clock_timestamp()<$1::timestamptz as live", [horizon])).rows[0].live;
              if (!live) throw new Error("Complete paid repository did not reach its native actor wait before the observation deadline");
              await observer.query("select pg_sleep(0.05)");
            }
          }
          await expect(deleter.query('delete from public."user" where id=$1', [fixture.userId])).rejects.toMatchObject({ code: "23503", constraint: "tribes_created_by_fkey" });
          await deleter.query("ROLLBACK");
          await reconciliation;
        } finally {
          // Closing the owned connection releases the account even if rollback is unavailable.
          await Promise.allSettled([deleter.query("ROLLBACK")]);
          await Promise.allSettled([deleter.end()]);
          await Promise.allSettled(reconciliation ? [reconciliation] : []);
          await Promise.allSettled([observer.end()]);
        }
      });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${scenario.requestId}`)).rows).toEqual([{ status: "cancelled", cancel_reason: "external_resolution" }]);
        expect((await transaction.execute(sql`select status from public.tribe_members where id=${scenario.originalMember.id}`)).rows).toEqual([{ status: "muted" }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification' and metadata->>'sourceEvent'='cancelled'`)).rows).toEqual([{ total: 2 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
