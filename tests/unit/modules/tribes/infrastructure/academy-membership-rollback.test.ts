/** @vitest-environment node */
/** Exercises native rollback of member, provenance, request, decision, audit and notices after the admission owner ran. @module academy-membership-rollback-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareTribeMembershipLifecycle } from "@/tests/support/tribe-membership-lifecycle-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS, MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeMembershipLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-membership-lifecycle-repository";
import { ManageTribeMembershipUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-membership-use-cases";
import { createAdmissionMembershipLifecycleWriter } from "@/src/modules/academy-admissions/setup";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { TRIBE_MEMBERSHIP_LIFECYCLE_OPERATION } from "@/src/modules/tribes/constants/tribe-membership-lifecycle";
import { ADMISSION_OPERATION_LEASE_MS } from "@/src/modules/academy-admissions/constants/admission-operation";
import { TribeMembershipLifecycleError } from "@/src/modules/tribes/domain/errors/tribe-membership-lifecycle-error";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native atomic membership rollback", () => {
  it("should rollback pending cancellation and basic-source revocation and resume only the same original after its actual lease expires", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareTribeMembershipLifecycle(database), leaderContext = { userId: fixture.leader.userId, email: fixture.leader.email };
      let failAfterReconciliation = true;
      const stagedFailures: { kind: string; memberCount: number; cancelledRequests: number; revokedEffects: number }[] = [];
      /** Reads only PostgreSQL's private error code through the cause chain; no message, query or parameters are printed. */
      function privateSqlState(error: unknown): string | null {
        const visited = new Set<unknown>();
        let cause = error;
        while (cause && typeof cause === "object" && !visited.has(cause)) {
          visited.add(cause);
          if ("code" in cause && cause.code === "22012") return cause.code;
          cause = "cause" in cause ? cause.cause : null;
        }
        return null;
      }
      /** Binds a real stored native account and injects only a failure in the owned admission collaborator. */
      function owner(actor: typeof fixture.leader) {
        const own = { userId: actor.userId, email: actor.email };
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: actor.userId, sessionId: actor.sessionId }), (_identity, run) => database.withContext(own, run));
        const writer = new PostgresTribeMembershipLifecycleRepository((_context, run) => database.withContext(own, run), async () => fixture.security, (transaction) => ({
          async reconcile(event) {
            await createAdmissionMembershipLifecycleWriter(transaction).reconcile(event);
            if (failAfterReconciliation) {
              const staged = (await transaction.execute<{member_count: number;cancelled_requests: number;revoked_effects: number}>(sql`select (select count(*)::integer from public.tribe_members where id=${event.memberId} and tribe_id=${event.tribeId} and user_id=${event.userId}) as member_count,(select count(*)::integer from public.academy_admission_requests where tribe_id=${event.tribeId} and user_id=${event.userId} and status='cancelled') as cancelled_requests,(select count(*)::integer from public.academy_admission_membership_effects where tribe_id=${event.tribeId} and user_id=${event.userId} and applied_at is not null and revoked_at is not null) as revoked_effects`)).rows[0];
              stagedFailures.push({ kind: event.kind, memberCount: staged.member_count, cancelledRequests: staged.cancelled_requests, revokedEffects: staged.revoked_effects });
              await transaction.execute(sql`select 1/0`);
            }
          },
        }));
        return new ManageTribeMembershipUseCases(accounts, writer);
      }
      /** Reads only synthetic business state and safe effect counts; original registry metadata is checked separately. */
      const snapshot = () => database.withContext(leaderContext, async (transaction) => ({
        members: (await transaction.execute(sql`select id,user_id,role,status,status_reason,created_at::text,admission_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} order by id`)).rows,
        requests: (await transaction.execute(sql`select id,status,version,decision_id,cancel_reason,submitted_at::text,expires_at::text,binding_id,proof_id from public.academy_admission_requests where tribe_id=${fixture.tribeId} order by id`)).rows,
        effects: (await transaction.execute(sql`select id,member_id,applied_at::text,revoked_at::text,revocation_reason from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId} order by id`)).rows,
        decisions: (await transaction.execute(sql`select id,outcome,rule from public.academy_admission_decisions where tribe_id=${fixture.tribeId} order by id`)).rows,
        audits: (await transaction.execute(sql`select id,event_type,rule from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_request' order by id`)).rows,
        notificationAudits: (await transaction.execute(sql`select id,event_type,rule from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification' order by id`)).rows,
        obligations: (await transaction.execute(sql`select id,event_type from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} order by id`)).rows,
        notices: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.notifications where tribe_id=${fixture.tribeId}`)).rows[0].count,
      }));
      /** Observes the real database deadline; it never edits a claim, session or business clock. */
      async function waitForLease(actorUserId: string, operationId: string) {
        const deadline = Date.now() + ADMISSION_OPERATION_LEASE_MS;
        for (;;) {
          const original = await database.withContext(leaderContext, async (transaction) => (await transaction.execute<{expired: boolean;state: string}>(sql`select lease_until<=clock_timestamp() as expired,state from public.academy_admission_operations where tribe_id=${fixture.tribeId} and actor_user_id=${actorUserId} and operation_type=${TRIBE_MEMBERSHIP_LIFECYCLE_OPERATION} and idempotency_key=${operationId}`)).rows[0]);
          expect(original?.state).toBe("started");
          if (original.expired) return;
          if (Date.now() >= deadline) throw new Error("Membership rollback validation failed: original lease did not expire within its configured bound");
          await delay(MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS);
        }
      }
      const leader = owner(fixture.leader), block = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), memberId: fixture.memberIds.applicant, action: "block" as const, expectedStatus: "removed" as const, confirmed: true };
      const beforeBlock = await snapshot();
      const blockError = await leader.change(block).then(() => null, (error: unknown) => error);
      expect(blockError).toBeInstanceOf(TribeMembershipLifecycleError);
      expect(blockError).toMatchObject({ code: "operation_unresolved", operationId: block.operationId });
      expect(privateSqlState(blockError)).toBe("22012");
      expect(stagedFailures).toEqual([{ kind: "conduct_blocked", memberCount: 1, cancelledRequests: 1, revokedEffects: 0 }]);
      expect(await snapshot()).toEqual(beforeBlock);
      await expect(leader.recover(block)).resolves.toEqual({ state: "started", operationId: block.operationId });
      expect(await snapshot()).toEqual(beforeBlock);
      failAfterReconciliation = false;
      await waitForLease(fixture.leader.userId, block.operationId);
      await expect(leader.change(block)).resolves.toMatchObject({ state: "completed", result: { outcome: "changed", status: "blocked" } });
      const blockFinal = await snapshot();
      expect(blockFinal.requests).toMatchObject([{ id: fixture.requestId, status: "cancelled", cancel_reason: "nonrecoverable_membership" }]);
      expect(blockFinal.decisions).toHaveLength(1); expect(blockFinal.obligations).toHaveLength(1); expect(blockFinal.audits).toHaveLength(1);
      expect(blockFinal.notificationAudits.map((audit) => audit.event_type).sort()).toEqual(["notification_materialized", "notification_obligation_created"]);
      const requestId = randomUUID(), decisionId = randomUUID(), effectId = randomUUID();
      await database.withContext(leaderContext, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        await transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='payment_blocked' where id=${fixture.memberIds.leaving}`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${fixture.tribeId},${fixture.leaving.userId},'common',clock_timestamp()+interval '29 days')`);
        await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,membership_effect_id) values (${decisionId},${requestId},${fixture.tribeId},${fixture.leaving.userId},1,'approved',${fixture.leader.userId},'user','manual_review',1,1,${effectId})`);
        await transaction.execute(sql`update public.academy_admission_requests set status='approved',version=version+1,decision_id=${decisionId} where id=${requestId}`);
        await transaction.execute(sql`insert into public.academy_admission_notification_obligations(tribe_id,request_id,applicant_user_id,event_type) values (${fixture.tribeId},${requestId},${fixture.leaving.userId},'approved')`);
        await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type) values (${fixture.tribeId},${fixture.leader.userId},'admission_request',${requestId},'approved')`);
        expect(await createAcademyApprovedMembershipWriter(transaction).apply({ tribeId: fixture.tribeId, userId: fixture.leaving.userId, decisionId })).toMatchObject({ status: "joined", member: { status: "muted" } });
      });
      const leaving = owner(fixture.leaving), leave = { ...block, operationId: randomUUID(), memberId: fixture.memberIds.leaving, action: "leave" as const, expectedStatus: "muted" as const };
      const beforeLeave = await snapshot(); failAfterReconciliation = true;
      const leaveError = await leaving.change(leave).then(() => null, (error: unknown) => error);
      expect(leaveError).toBeInstanceOf(TribeMembershipLifecycleError);
      expect(leaveError).toMatchObject({ code: "operation_unresolved", operationId: leave.operationId });
      expect(privateSqlState(leaveError)).toBe("22012");
      expect(stagedFailures).toEqual([{ kind: "conduct_blocked", memberCount: 1, cancelledRequests: 1, revokedEffects: 0 }, { kind: "left", memberCount: 0, cancelledRequests: 0, revokedEffects: 1 }]);
      expect(await snapshot()).toEqual(beforeLeave);
      await expect(leaving.recover(leave)).resolves.toEqual({ state: "started", operationId: leave.operationId });
      expect(await snapshot()).toEqual(beforeLeave);
      failAfterReconciliation = false;
      await waitForLease(fixture.leaving.userId, leave.operationId);
      await expect(leaving.change(leave)).resolves.toMatchObject({ state: "completed", result: { outcome: "changed", deleted: true } });
      await expect(leaving.change(leave)).resolves.toMatchObject({ state: "completed", replayed: true });
      const final = await snapshot();
      expect(final.effects).toMatchObject([{ id: effectId, member_id: null, revocation_reason: "membership_deleted" }]);
      expect(final.members.some((member) => member.id === fixture.memberIds.leaving)).toBe(false);
      expect(final.decisions).toHaveLength(2); expect(final.obligations).toHaveLength(2); expect(final.audits).toHaveLength(2);
      expect(final.notificationAudits).toEqual(blockFinal.notificationAudits);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
