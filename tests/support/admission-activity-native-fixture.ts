/** Composes genuine current usage owners and historical native memberships on an owned branch. @module admission-activity-native-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionPrivateContent } from "./admission-private-content-fixture";
import { ADMISSION_ACTIVITY_VALIDATION as VALIDATION } from "./constants/admission-activity-validation";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { MessagingUsageContext, MessagingUsageSensitiveContext } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresMessagingUsageOperations } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-operations";
import { messagingUsagePolicyUpdateSchema } from "@/src/modules/messaging/infrastructure/api/messaging-request-schemas";

/** @param database - Confirmed disposable branch; the harness owns cleanup. @param onPhase - Fixed setup checkpoints without input, SQL or credential data. @returns Two isolated tenants, real versioned usage/audit effects and current native sessions, with no connection or external send. */
export async function prepareAdmissionActivityNative(database: AcademyAdmissionTestDatabase, onPhase: (phase: string) => void = () => {}) {
  onPhase("prepare_private_content");
  const prepared = await prepareAdmissionPrivateContent(database), fixture = prepared.fixture;
  onPhase("prepare_foreign_tenant");
  const foreign = await prepared.createApplicant(), foreignTribeId = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${foreignTribeId},'Otra academia de ejemplo',${`activity-${foreignTribeId}`},${foreign.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${foreignTribeId},${foreign.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${foreignTribeId},'academy',true)`);
  });

  /** @param actor - Actual stored native account. @param tribeId - Its existing tenant. @returns The unchanged real writer with persisted operation-specific recency; no key or policy guard is bypassed. */
  async function usageFor(actor: { userId: string; sessionId: string; email: string }, tribeId: string) {
    const own = { userId: actor.userId, email: actor.email };
    const contexts = await database.withContext(own, async (transaction) => {
      const binding = (await transaction.execute<{ account_id: string; provider_subject: string }>(sql`select account_id,provider_subject from public.global_session_identity_bindings where session_id=${actor.sessionId} and user_id=${actor.userId} and invalidated_at is null`)).rows[0];
      if (!binding) throw new Error("Activity fixture failed: native_binding_unavailable");
      const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), validUntil = new Date(now.getTime() + VALIDATION.evidenceLifetimeMs);
      await transaction.execute(sql`update public.session set "expiresAt"=${new Date(now.getTime() + VALIDATION.sessionLifetimeMs)} where id=${actor.sessionId}`);
      for (const operation of [REAUTHENTICATION_OPERATION.initializeMessagingUsage, REAUTHENTICATION_OPERATION.updateMessagingUsage]) {
        const intentId = randomUUID();
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${actor.userId},${actor.sessionId},${binding.account_id},${binding.provider_subject},${tribeId},${operation},${tribeId},'/synthetic-activity',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${actor.userId},${binding.account_id},${binding.provider_subject},${actor.sessionId},${tribeId},${operation},${tribeId},${now},${now},${validUntil})`);
      }
      const read: MessagingUsageContext = { actorUserId: actor.userId, sessionId: actor.sessionId, tribeId, requestId: randomUUID() };
      const sensitive = { ...read, accountId: binding.account_id, subject: binding.provider_subject, authenticatedAt: now, validUntil, resourceId: tribeId };
      return { read, initialize: { ...sensitive, operation: REAUTHENTICATION_OPERATION.initializeMessagingUsage } satisfies MessagingUsageSensitiveContext, update: { ...sensitive, operation: REAUTHENTICATION_OPERATION.updateMessagingUsage } satisfies MessagingUsageSensitiveContext };
    });
    const execute = <Result>(_context: MessagingUsageContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(own, run);
    const operations = new PostgresMessagingUsageOperations(execute, async () => fixture.config);
    const update = (expectedVersion: number, verificationDailyLimit: number, notificationDailyLimit: number = VALIDATION.initialNotificationLimit) => operations.update(contexts.update, messagingUsagePolicyUpdateSchema.parse({ operationId: randomUUID(), expectedVersion, allowedCountries: ["AR"], verificationDailyLimit, notificationDailyLimit, confirmed: true }));
    return { operations, contexts, update };
  }
  onPhase("prepare_usage_recency");
  const usage = await usageFor({ userId: fixture.userId, sessionId: fixture.sessionId, email: fixture.own.email }, fixture.tribeId);
  const foreignUsage = await usageFor(foreign, foreignTribeId);
  onPhase("initialize_usage_owner");
  await usage.operations.initialize(usage.contexts.initialize, randomUUID());
  await usage.update(1, VALIDATION.initialVerificationLimit);
  onPhase("initialize_foreign_usage_owner");
  await foreignUsage.operations.initialize(foreignUsage.contexts.initialize, randomUUID());
  await foreignUsage.update(1, VALIDATION.initialVerificationLimit, VALIDATION.foreignNotificationLimit);
  return { ...prepared, usage, foreign, foreignTribeId, slug: `allowlist-${fixture.tribeId}`, foreignSlug: `activity-${foreignTribeId}` };
}
