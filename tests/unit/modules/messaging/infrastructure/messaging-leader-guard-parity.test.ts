/** @vitest-environment node */
/** Pins on real PostgreSQL the outcomes and the lock order of the messaging leadership guards, so their implementation can change without changing either. @module messaging-leader-guard-parity-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { expectedLockStep, observeGuardLockStep, readRolledBackGuardOutcome } from "@/tests/support/guard-lock-order";
import type { GuardLockedRow } from "@/tests/support/constants/guard-lock-order";
import { PostgresMessagingAuthorizationReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-authorization-reader";
import { PostgresMessagingConfigurationReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-configuration-reader";
import { authorizeMessagingTribeManagement } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-authorizer";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConfigurationContext } from "@/src/modules/messaging/domain/repositories/messaging-configuration-reader";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { MESSAGING_LEADER_GUARD_PARITY_VALIDATION as VALIDATION } from "@/tests/support/constants/messaging-leader-guard-parity";

type ManagementContext = Parameters<typeof authorizeMessagingTribeManagement>[1];
/** A scenario changes rows, or the transaction actor, only inside its own rolled-back transaction. */
type Scenario = (transaction: RequestDatabase) => Promise<unknown>;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native messaging leader guard parity", () => {
  it("should keep the leadership, configuration and tribe management guards' outcomes and lock order", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs });
      const leaderId = leader.fixture.userId, guardianId = randomUUID(), guardianSessionId = randomUUID(), otherUserId = randomUUID();
      await database.withContext(leader.fixture.own, async (transaction) => {
        for (const id of [guardianId, otherUserId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${id},'Synthetic member',${`${id}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${guardianSessionId},${guardianId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${leader.tribeId},${guardianId},'guardian','active')`);
      });
      const asGuardian: Scenario = (transaction) => transaction.execute(sql`select set_config('app.current_user_id',${guardianId},true)`);
      const shared: Record<string, Scenario> = {
        expired_session: (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 minute' where id=${leader.sessionId}`),
        demoted_leader: (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${leader.tribeId} and user_id=${leaderId}`),
        blocked_leader: (transaction) => transaction.execute(sql`update public.tribe_members set status='blocked' where tribe_id=${leader.tribeId} and user_id=${leaderId}`),
      };
      /** @param prepare - Scenario change. @param run - Guard call. @returns Its outcome in a rolled-back transaction. */
      const outcome = (prepare: Scenario | undefined, run: (transaction: RequestDatabase) => Promise<unknown>) => readRolledBackGuardOutcome(database, leader, prepare, run);

      // Current leadership facts, read by every messaging page and command before its own work.
      const leadership = (sessionId: string, tribeId: string, userId: string) => async (transaction: RequestDatabase) => { throw Object.assign(new Error("Leadership facts"), { code: JSON.stringify(await new PostgresMessagingAuthorizationReader(transaction, sessionId).getCurrentLeadership(tribeId, userId)) }); };
      const facts = (role: string, userId: string) => JSON.stringify({ tribeId: leader.tribeId, leaderUserId: leaderId, membership: { userId, role, status: "active" } });
      expect({
        current_leader: await outcome(undefined, leadership(leader.sessionId, leader.tribeId, leaderId)),
        guardian_viewer: await outcome(asGuardian, leadership(guardianSessionId, leader.tribeId, guardianId)),
        another_actor: await outcome(undefined, leadership(leader.sessionId, leader.tribeId, otherUserId)),
        missing_tribe: await outcome(undefined, leadership(leader.sessionId, randomUUID(), leaderId)),
        foreign_session: await outcome(undefined, leadership(randomUUID(), leader.tribeId, leaderId)),
        expired_session: await outcome(shared.expired_session, leadership(leader.sessionId, leader.tribeId, leaderId)),
        demoted_leader: await outcome(shared.demoted_leader, leadership(leader.sessionId, leader.tribeId, leaderId)),
        blocked_leader: await outcome(shared.blocked_leader, leadership(leader.sessionId, leader.tribeId, leaderId)),
      }).toEqual({ current_leader: facts("leader", leaderId), guardian_viewer: facts("guardian", guardianId), another_actor: "null", missing_tribe: "null", foreign_session: "null", expired_session: "null", demoted_leader: "null", blocked_leader: "null" });

      // Connection configuration metadata, guarded at its start and again before it returns.
      const security = async () => ({ recoveryLocked: false, environment: "synthetic", securityEpoch: randomUUID() });
      const configuration = (context: Partial<MessagingConfigurationContext>) => async (transaction: RequestDatabase) => {
        const result = await new PostgresMessagingConfigurationReader((_context, run) => run(transaction), security).read({ actorUserId: leaderId, sessionId: leader.sessionId, tribeId: leader.tribeId, requestId: randomUUID(), audience: "leader", ...context });
        throw Object.assign(new Error("Configuration audience"), { code: `audience:${result.audience}` });
      };
      expect({
        current_leader: await outcome(undefined, configuration({})),
        guardian_viewer: await outcome(asGuardian, configuration({ actorUserId: guardianId, sessionId: guardianSessionId, audience: "guardian" })),
        guardian_as_leader: await outcome(asGuardian, configuration({ actorUserId: guardianId, sessionId: guardianSessionId })),
        another_actor: await outcome(undefined, configuration({ actorUserId: otherUserId })),
        missing_tribe: await outcome(undefined, configuration({ tribeId: randomUUID() })),
        foreign_session: await outcome(undefined, configuration({ sessionId: randomUUID() })),
        expired_session: await outcome(shared.expired_session, configuration({})),
        demoted_leader: await outcome(shared.demoted_leader, configuration({})),
        blocked_leader: await outcome(shared.blocked_leader, configuration({})),
      }).toEqual({ current_leader: "audience:leader", guardian_viewer: "audience:guardian", guardian_as_leader: "permission_denied", another_actor: "permission_denied", missing_tribe: "permission_denied", foreign_session: "authentication_required", expired_session: "authentication_required", demoted_leader: "permission_denied", blocked_leader: "permission_denied" });

      // Tribe management for usage, connections and delivery recovery, with its sensitive Google-bound variants.
      const usage: ManagementContext = { actorUserId: leaderId, sessionId: leader.sessionId, tribeId: leader.tribeId, requestId: randomUUID() };
      const google = { accountId: leader.accountId, subject: (await database.withContext(leader.fixture.own, (transaction) => transaction.execute<{ subject: string }>(sql`select "accountId" as subject from public.account where id=${leader.accountId}`))).rows[0].subject };
      const sensitiveUsage: ManagementContext = { ...usage, ...google, operation: REAUTHENTICATION_OPERATION.updateMessagingUsage, resourceId: leader.tribeId };
      const connectionId = randomUUID();
      const suspendConnection: ManagementContext = { ...usage, ...google, operation: REAUTHENTICATION_OPERATION.suspendMessagingConnection, connectionId, resourceId: connectionId };
      const saveCredentials: ManagementContext = { ...usage, ...google, operation: REAUTHENTICATION_OPERATION.saveMessagingCredentials, resourceId: leader.tribeId };
      const deliveryId = randomUUID();
      const recoverDelivery: ManagementContext = { ...usage, ...google, operation: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification, deliveryId, resourceId: deliveryId };
      const management = (context: ManagementContext) => (transaction: RequestDatabase) => authorizeMessagingTribeManagement(transaction, context);
      expect({
        current_leader: await outcome(undefined, management(usage)),
        another_actor: await outcome(undefined, management({ ...usage, actorUserId: otherUserId })),
        missing_tribe: await outcome(undefined, management({ ...usage, tribeId: randomUUID() })),
        foreign_session: await outcome(undefined, management({ ...usage, sessionId: randomUUID() })),
        expired_session: await outcome(shared.expired_session, management(usage)),
        demoted_leader: await outcome(shared.demoted_leader, management(usage)),
        blocked_leader: await outcome(shared.blocked_leader, management(usage)),
        guardian_member: await outcome(asGuardian, management({ ...usage, actorUserId: guardianId, sessionId: guardianSessionId })),
        sensitive_usage: await outcome(undefined, management(sensitiveUsage)),
        sensitive_wrong_subject: await outcome(undefined, management({ ...sensitiveUsage, subject: randomUUID() })),
        sensitive_invalidated_binding: await outcome((transaction) => transaction.execute(sql`update public.global_session_identity_bindings set invalidated_at=clock_timestamp() where session_id=${leader.sessionId}`), management(sensitiveUsage)),
        sensitive_crossed_resource: await outcome(undefined, management({ ...sensitiveUsage, resourceId: randomUUID() })),
        sensitive_expired_session: await outcome(shared.expired_session, management(sensitiveUsage)),
        suspend_connection: await outcome(undefined, management(suspendConnection)),
        save_credentials: await outcome(undefined, management(saveCredentials)),
        recover_missing_delivery: await outcome(undefined, management(recoverDelivery)),
      }).toEqual({
        current_leader: "authorized", another_actor: "permission_denied", missing_tribe: "permission_denied", foreign_session: "authentication_required", expired_session: "authentication_required", demoted_leader: "permission_denied", blocked_leader: "permission_denied", guardian_member: "permission_denied",
        sensitive_usage: "authorized", sensitive_wrong_subject: "authentication_required", sensitive_invalidated_binding: "authentication_required", sensitive_crossed_resource: "permission_denied", sensitive_expired_session: "authentication_required",
        suspend_connection: "authorized", save_credentials: "authorized", recover_missing_delivery: "permission_denied",
      });

      // Lock order: while a guard waits on one row it already holds every earlier row and none of the later ones.
      const lockScenarios: { name: string; order: readonly GuardLockedRow[]; guard: (transaction: RequestDatabase) => Promise<unknown>; exclusive: boolean }[] = [
        { name: "leadership", order: VALIDATION.leadershipLockOrder, guard: (transaction) => new PostgresMessagingAuthorizationReader(transaction, leader.sessionId).getCurrentLeadership(leader.tribeId, leaderId), exclusive: false },
        { name: "configuration", order: VALIDATION.configurationLockOrder, guard: (transaction) => new PostgresMessagingConfigurationReader((_context, run) => run(transaction), security).read({ actorUserId: leaderId, sessionId: leader.sessionId, tribeId: leader.tribeId, requestId: randomUUID(), audience: "leader" }), exclusive: false },
        { name: "management", order: VALIDATION.managementLockOrder, guard: management(usage), exclusive: false },
        { name: "sensitive_usage", order: VALIDATION.sensitiveManagementLockOrder, guard: management(sensitiveUsage), exclusive: false },
        { name: "suspend_connection", order: VALIDATION.sensitiveManagementLockOrder, guard: management(suspendConnection), exclusive: true },
      ];
      for (const { name, order, guard, exclusive } of lockScenarios) {
        for (const blockedRow of order) {
          const step = await observeGuardLockStep(database, leader, guard, blockedRow, order);
          expect({ name, blockedRow, ...step }).toEqual({ name, blockedRow, ...expectedLockStep(order, blockedRow), outcome: "authorized", tribeExclusive: exclusive });
        }
      }
    });
  }, VALIDATION.timeoutMs);
});
