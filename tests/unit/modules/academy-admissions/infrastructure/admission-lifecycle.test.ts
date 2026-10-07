/** @vitest-environment node */
/** Exercises lifecycle row events and terminal co-commit against real protected SQL. @module admission-lifecycle-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";

/** @param database - Owned synthetic branch. @param expired - Seeds an original deadline already overdue. @returns Scoped original rows, with no platform/provider mocks or weakened constraints. */
async function fixture(database: AcademyAdmissionTestDatabase, expired = false) {
  process.stdout.write(JSON.stringify({ phase: "owned_admission_lifecycle_branch", branch: database.branch }) + "\n");
  for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005092500_guard_messaging_attempts.sql", "20261005093000_guard_academy_membership_sources.sql", "20261006180000_guard_subscription_membership_sources.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql", "20261007030000_capture_admission_decision_evidence.sql"]) await database.applyMigration(migration);
  const tribeId = randomUUID(), userId = randomUUID(), leaderId = randomUUID(), requestId = randomUUID();
  const own = { userId: leaderId, email: null };
  await database.withContext(own, async (transaction) => {
    const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp()::text as now`)).rows[0].now;
    for (const id of [userId, leaderId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${id},'Lifecycle participant',${`${id}@example.test`},false,${now},${now})`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Lifecycle academy',${`lifecycle-${tribeId}`},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason) values (${tribeId},${leaderId},'leader','active','none'),(${tribeId},${userId},'tribemate','removed','subscription_inactive')`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,submitted_at,expires_at) values (${requestId},${tribeId},${userId},'common','email',${`${userId}@example.test`},'declared','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,'Original presentation',case when ${expired} then ${now}::timestamptz-interval '31 days' else ${now}::timestamptz end,case when ${expired} then ${now}::timestamptz-interval '1 day' else ${now}::timestamptz+interval '30 days' end)`);
  });
  return { tribeId, userId, leaderId, requestId, own };
}

/** @param database - Owned branch. @param data - Exact original lifecycle scope. @param rule - Expected real owner event. @returns After asserting one irreversible system decision and preserved provenance. */
async function assertClosure(database: AcademyAdmissionTestDatabase, data: Awaited<ReturnType<typeof fixture>>, rule: string): Promise<void> {
  await database.withContext(data.own, async (transaction) => {
    expect((await transaction.execute(sql`select status,version,cancel_reason,applicant_message,evidence_source,binding_id,proof_id from public.academy_admission_requests where id=${data.requestId}`)).rows).toEqual([{ status: "cancelled", version: 2, cancel_reason: rule, applicant_message: "Original presentation", evidence_source: "declared", binding_id: null, proof_id: null }]);
    expect((await transaction.execute(sql`select outcome,actor_kind,actor_user_id,rule,membership_effect_id,evidence_snapshot from public.academy_admission_decisions where request_id=${data.requestId}`)).rows).toEqual([{ outcome: "cancelled", actor_kind: "system", actor_user_id: null, rule, membership_effect_id: null, evidence_snapshot: { kind: "declared", referenceId: null, verifiedAt: null } }]);
    expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_notification_obligations where request_id=${data.requestId}) as obligations,(select count(*)::int from public.notifications where tribe_id=${data.tribeId} and recipient_user_id=${data.userId}) as notices,(select count(*)::int from public.academy_admission_audit_events where resource_id=${data.requestId}) as audits`)).rows).toEqual([{ obligations: 1, notices: 1, audits: 1 }]);
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission lifecycle events", () => {
  it("should expire at its original deadline before a later unavailable-owner event and keep private helpers inaccessible", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await fixture(database, true);
      await expect(database.withContext({ userId: data.userId, email: null }, (transaction) => transaction.execute(sql`select public.close_unavailable_admission_request(${data.tribeId},${data.userId},'membership_deleted')`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await database.withContext(data.own, (transaction) => transaction.execute(sql`delete from public.tribe_members where tribe_id=${data.tribeId} and user_id=${data.userId}`));
      await database.withContext(data.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,cancel_reason from public.academy_admission_requests where id=${data.requestId}`)).rows).toEqual([{ status: "expired", version: 2, cancel_reason: null }]);
        expect((await transaction.execute(sql`select outcome,rule,actor_kind from public.academy_admission_decisions where request_id=${data.requestId}`)).rows).toEqual([{ outcome: "expired", rule: "expired", actor_kind: "system" }]);
      });
    });
  }, 240_000);

  it.each([true, false])("should reject a backward source lock with visible pending=%s, roll back its mutation and succeed after scope release", async (visiblePending) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await fixture(database);
      if (!visiblePending) await database.withContext(data.own, (transaction) => transaction.execute(sql`delete from public.academy_admission_requests where id=${data.requestId}`));
      let releaseHold!: () => void, signalLocked!: () => void;
      const held = new Promise<void>((resolve) => { signalLocked = resolve; });
      const release = new Promise<void>((resolve) => { releaseHold = resolve; });
      const holding = database.withContext(data.own, async (transaction) => {
        // Only this bounded test holder waits for a second Neon connection; production's idle guard stays unchanged.
        await transaction.execute(sql`set local idle_in_transaction_session_timeout='120s'`);
        await transaction.execute(sql`select id from public.tribes where id=${data.tribeId} for update`);
        signalLocked();
        await release;
      });
      await held;
      try {
        await expect(database.withContext(data.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='conduct_blocked' where tribe_id=${data.tribeId} and user_id=${data.userId}`))).rejects.toMatchObject({ cause: { code: "55P03" } });
      } finally { releaseHold(); await holding; }
      await database.withContext(data.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,status_reason from public.tribe_members where tribe_id=${data.tribeId} and user_id=${data.userId}`)).rows).toEqual([{ status: "removed", status_reason: "subscription_inactive" }]);
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${data.requestId}`)).rows).toEqual(visiblePending ? [{ status: "pending", version: 1 }] : []);
        await transaction.execute(sql`select id from public.tribes where id=${data.tribeId} for update`);
        await transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='conduct_blocked' where tribe_id=${data.tribeId} and user_id=${data.userId}`);
      });
      if (visiblePending) await assertClosure(database, data, "nonrecoverable_membership");
    }, { concurrentTransactions: 2 });
  }, 240_000);

  it("should cancel on a real academy exit and never resurrect the request when academy mode returns", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await fixture(database);
      await database.withContext(data.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set access_model='legacy',admission_enabled=false where tribe_id=${data.tribeId}`));
      await assertClosure(database, data, "academy_unavailable");
      await database.withContext(data.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set access_model='academy',admission_enabled=true where tribe_id=${data.tribeId}`));
      await assertClosure(database, data, "academy_unavailable");
    });
  }, 240_000);

  it("should cancel on actual membership deletion without confusing initial absence with a deletion event", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await fixture(database);
      await database.withContext(data.own, (transaction) => transaction.execute(sql`delete from public.tribe_members where tribe_id=${data.tribeId} and user_id=${data.userId}`));
      await assertClosure(database, data, "membership_deleted");
      expect(await database.withContext(data.own, async (transaction) => (await transaction.execute(sql`select id from public.tribe_members where tribe_id=${data.tribeId} and user_id=${data.userId}`)).rows)).toEqual([]);
    });
  }, 240_000);

  it("should preserve commercial restriction and pause but close after a real nonrecoverable moderation change", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await fixture(database);
      await database.withContext(data.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${data.tribeId}`);
        await transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='payment_blocked' where tribe_id=${data.tribeId} and user_id=${data.userId}`);
      });
      expect(await database.withContext(data.own, async (transaction) => (await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${data.requestId}`)).rows)).toEqual([{ status: "pending", version: 1 }]);
      await database.withContext(data.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='conduct_blocked' where tribe_id=${data.tribeId} and user_id=${data.userId}`));
      await assertClosure(database, data, "nonrecoverable_membership");
    });
  }, 240_000);

  it("should record account-deletion resolution before native cascades remove its own request without leaving a readable notice", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await fixture(database);
      await database.withContext(data.own, (transaction) => transaction.execute(sql`delete from public."user" where id=${data.userId}`));
      await database.withContext(data.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.academy_admission_requests where id=${data.requestId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select rule,event_type,actor_user_id from public.academy_admission_audit_events where resource_id=${data.requestId}`)).rows).toEqual([{ rule: "account_deleted", event_type: "cancelled", actor_user_id: null }]);
        expect((await transaction.execute(sql`select id from public.notifications where recipient_user_id=${data.userId}`)).rows).toEqual([]);
      });
    });
  }, 240_000);
});
