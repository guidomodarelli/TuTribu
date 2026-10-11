/** @vitest-environment node */
/** Exercises membership-owned terminal changes against real protected admission storage. @module academy-membership-lifecycle-infrastructure-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS } from "@/tests/support/constants/legacy-admission-entry";
import { SUBSCRIPTION_MEMBERSHIP_MIGRATIONS } from "@/tests/support/constants/subscription-membership-reconciliation";
import { prepareTribeMembershipLifecycle } from "@/tests/support/tribe-membership-lifecycle-fixture";
import type { TribeMembershipLifecycleContext } from "@/src/modules/tribes/domain/repositories/tribe-membership-lifecycle-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { PostgresTribeLeadershipRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-leadership-repository";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native academy membership lifecycle", () => {
  it("should cancel a pending request and stage its system decision and notice atomically when membership becomes conduct blocked", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      for (const migration of SUBSCRIPTION_MEMBERSHIP_MIGRATIONS) await database.applyMigration(migration);
      const leaderId = randomUUID(), tribeId = randomUUID(), applicantId = randomUUID(), requestId = randomUUID();
      const fixture = { userId: leaderId, own: { userId: leaderId, email: null } };
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${leaderId},'Synthetic lifecycle leader',${`${leaderId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Synthetic membership applicant',${`${applicantId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic membership lifecycle',${`membership-${tribeId}`},${fixture.userId})`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active'),(${tribeId},${applicantId},'tribemate','removed')`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
        const activation = (await transaction.execute<{instant: Date}>(sql`select clock_timestamp() as instant`)).rows[0].instant;
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${activation})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${activation} where id=${tribeId}`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${tribeId},${applicantId},'common',clock_timestamp()+interval '29 days')`);
      });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${tribeId} for update`);
        await transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='conduct_blocked' where tribe_id=${tribeId} and user_id=${applicantId}`);
      });
      const result = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{status: string;cancel_reason: string|null;decision_count: number;obligation_count: number;audit_count: number}>(sql`
        select request.status,request.cancel_reason,
          (select count(*)::integer from public.academy_admission_decisions where request_id=request.id and actor_kind='system' and outcome='cancelled') as decision_count,
          (select count(*)::integer from public.academy_admission_notification_obligations where request_id=request.id and event_type='cancelled') as obligation_count,
          (select count(*)::integer from public.academy_admission_audit_events where resource_id=request.id and event_type='cancelled') as audit_count
        from public.academy_admission_requests request where request.id=${requestId}`)).rows[0]);
      expect(result).toEqual({ status: "cancelled", cancel_reason: "nonrecoverable_membership", decision_count: 1, obligation_count: 1, audit_count: 1 });
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);

  it("should commit and recover real moderation and leave actions while preserving nonrecoverable restrictions and current-state conflicts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareTribeMembershipLifecycle(database), own = { userId: fixture.leader.userId, email: fixture.leader.email };
      const command = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), memberId: fixture.memberIds.applicant, action: "block" as const, expectedStatus: "removed" as const, confirmed: true };
      const leader = fixture.owner(fixture.leader), applicant = fixture.owner(fixture.applicant);
      const blocked = await leader.useCases.change(command);
      expect(blocked).toMatchObject({ state: "completed", replayed: false, result: { outcome: "changed", action: "block", status: "blocked", deleted: false } });
      expect(await leader.useCases.change(command)).toMatchObject({ state: "completed", replayed: true, result: blocked.state === "completed" ? blocked.result : undefined });
      const counts = await database.withContext(own, async (transaction) => (await transaction.execute<{status: string;cancel_reason: string;decisions: number;obligations: number}>(sql`select request.status,request.cancel_reason,(select count(*)::integer from public.academy_admission_decisions where request_id=request.id) as decisions,(select count(*)::integer from public.academy_admission_notification_obligations where request_id=request.id) as obligations from public.academy_admission_requests request where id=${fixture.requestId}`)).rows[0]);
      expect(counts).toEqual({ status: "cancelled", cancel_reason: "nonrecoverable_membership", decisions: 1, obligations: 1 });
      const deniedLeave = { ...command, operationId: randomUUID(), action: "leave" as const, expectedStatus: "blocked" as const };
      await expect(applicant.useCases.change(deniedLeave)).resolves.toMatchObject({ state: "completed", result: { outcome: "denied", code: "permission_denied" } });
      await expect(applicant.useCases.recover(deniedLeave)).resolves.toMatchObject({ state: "completed", result: { outcome: "denied", code: "permission_denied" } });
      await expect(applicant.useCases.change({ ...command, operationId: randomUUID(), memberId: fixture.memberIds.leaving, expectedStatus: "muted" })).resolves.toMatchObject({ state: "completed", result: { outcome: "denied", code: "permission_denied" } });
      await expect(applicant.useCases.change({ ...command, operationId: randomUUID(), memberId: fixture.memberIds.leaving, expectedStatus: "active" })).resolves.toMatchObject({ state: "completed", result: { outcome: "denied", code: "permission_denied" } });
      await expect(applicant.useCases.change({ ...command, operationId: randomUUID(), memberId: randomUUID(), expectedStatus: "active" })).resolves.toMatchObject({ state: "completed", result: { outcome: "denied", code: "permission_denied" } });
      const conflict = { ...command, operationId: randomUUID(), expectedStatus: "removed" as const };
      await expect(leader.useCases.change(conflict)).resolves.toMatchObject({ state: "completed", result: { outcome: "denied", code: "membership_conflict" } });
      await expect(leader.useCases.recover(conflict)).resolves.toMatchObject({ state: "completed", result: { outcome: "denied", code: "membership_conflict" } });
      await expect(leader.useCases.change({ ...command, memberId: fixture.memberIds.leaving, expectedStatus: "muted" })).rejects.toMatchObject({ code: "idempotency_conflict" });
      const basisRequestId = randomUUID(), basisDecisionId = randomUUID(), basisEffectId = randomUUID();
      const memberBefore = await database.withContext(own, async (transaction) => (await transaction.execute<{created_at: string}>(sql`select created_at::text from public.tribe_members where id=${fixture.memberIds.leaving}`)).rows[0]);
      await database.withContext(own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        await transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='payment_blocked' where id=${fixture.memberIds.leaving}`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${basisRequestId},${fixture.tribeId},${fixture.leaving.userId},'common',clock_timestamp()+interval '29 days')`);
        await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,membership_effect_id) values (${basisDecisionId},${basisRequestId},${fixture.tribeId},${fixture.leaving.userId},1,'approved',${fixture.leader.userId},'user','manual_review',1,1,${basisEffectId})`);
        await transaction.execute(sql`update public.academy_admission_requests set status='approved',decision_id=${basisDecisionId},version=version+1 where id=${basisRequestId}`);
        await transaction.execute(sql`insert into public.academy_admission_notification_obligations(tribe_id,request_id,applicant_user_id,event_type) values (${fixture.tribeId},${basisRequestId},${fixture.leaving.userId},'approved')`);
        await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type) values (${fixture.tribeId},${fixture.leader.userId},'admission_request',${basisRequestId},'approved')`);
        expect(await createAcademyApprovedMembershipWriter(transaction).apply({ tribeId: fixture.tribeId, userId: fixture.leaving.userId, decisionId: basisDecisionId })).toMatchObject({ status: "joined", member: { status: "muted", role: "tribemate" } });
      });
      const recoveredMember = await database.withContext(own, async (transaction) => (await transaction.execute<{created_at: string;admission_membership_effect_id: string}>(sql`select created_at::text,admission_membership_effect_id from public.tribe_members where id=${fixture.memberIds.leaving}`)).rows[0]);
      expect(recoveredMember).toEqual({ created_at: memberBefore.created_at, admission_membership_effect_id: basisEffectId });
      let loseResponse = true;
      const execute = async <Result>(_context: TribeMembershipLifecycleContext, run: (transaction: RequestDatabase) => Promise<Result>) => {
        const result = await database.withContext({ userId: fixture.leaving.userId, email: fixture.leaving.email }, run);
        if (loseResponse && result && typeof result === "object" && "state" in result && result.state === "completed") { loseResponse = false; throw new Error("Synthetic membership reply lost after commit"); }
        return result;
      };
      const leaving = fixture.owner(fixture.leaving, execute), leave = { ...command, operationId: randomUUID(), memberId: fixture.memberIds.leaving, action: "leave" as const, expectedStatus: "muted" as const };
      await expect(leaving.useCases.change(leave)).rejects.toMatchObject({ code: "operation_unresolved", operationId: leave.operationId });
      await expect(leaving.useCases.recover(leave)).resolves.toMatchObject({ state: "completed", result: { outcome: "changed", memberId: fixture.memberIds.leaving, action: "leave", status: "removed", deleted: true } });
      await expect(leaving.useCases.change(leave)).resolves.toMatchObject({ state: "completed", replayed: true });
      const persisted = await database.withContext(own, async (transaction) => (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.leaving.userId}`)).rows[0]);
      expect(persisted.count).toBe(0);
      const revoked = await database.withContext(own, async (transaction) => (await transaction.execute<{revocation_reason: string;member_id: string|null;revoked: boolean;applied: boolean}>(sql`select revocation_reason,member_id,revoked_at is not null as revoked,applied_at is not null as applied from public.academy_admission_membership_effects where id=${basisEffectId}`)).rows[0]);
      expect(revoked).toEqual({ revocation_reason: "membership_deleted", member_id: null, revoked: true, applied: true });
      await expect(database.withContext(own, (transaction) => transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,admission_membership_effect_id) values (${fixture.tribeId},${fixture.leaving.userId},'tribemate','active',${basisEffectId})`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp() where id=${fixture.leaving.sessionId}`));
      await expect(leaving.useCases.recover(leave)).rejects.toMatchObject({ code: "authentication_required", operationId: undefined });
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);

  it("should authorize the current canonical leader after a real transfer while denying the historical founder", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareTribeMembershipLifecycle(database, true), own = { userId: fixture.leader.userId, email: fixture.leader.email };
      await database.applyMigration("20261008200000_guard_messaging_leadership_changes.sql");
      const leadership = new PostgresTribeLeadershipRepository((_context, run) => database.withContext(own, run), async () => fixture.security);
      await expect(leadership.transfer({ tribeId: fixture.tribeId, actorUserId: fixture.leader.userId, sessionId: fixture.leader.sessionId, requestId: randomUUID() }, { operationId: randomUUID(), expectedLeaderUserId: fixture.leader.userId, nextLeaderUserId: fixture.successor.userId, formerLeaderRole: "guardian", confirmed: true })).resolves.toMatchObject({ state: "completed", result: { leaderUserId: fixture.successor.userId } });
      const command = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), memberId: fixture.memberIds.applicant, action: "remove" as const, expectedStatus: "removed" as const, confirmed: true };
      await expect(fixture.owner(fixture.successor).useCases.change(command)).resolves.toMatchObject({ state: "completed", result: { outcome: "changed", action: "remove", status: "removed" } });
      await expect(fixture.owner(fixture.leader).useCases.change({ ...command, operationId: randomUUID(), memberId: fixture.memberIds.leaving, expectedStatus: "muted" })).resolves.toMatchObject({ state: "completed", result: { outcome: "denied", code: "permission_denied" } });
      const history = await database.withContext(own, async (transaction) => (await transaction.execute<{created_by: string;leader: string}>(sql`select tribe.created_by,(select user_id from public.tribe_members where tribe_id=tribe.id and role='leader' and status='active') as leader from public.tribes tribe where tribe.id=${fixture.tribeId}`)).rows[0]);
      expect(history).toEqual({ created_by: fixture.leader.userId, leader: fixture.successor.userId });
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);
});
