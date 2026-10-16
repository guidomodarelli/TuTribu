/** Composes native whole-group authorization without any provider transport. @module admission-notification-group-authority-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionNotificationGroupsForEmail } from "./admission-notification-group-preparation-fixture";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresCurrentMessagingProvider } from "@/src/modules/messaging/infrastructure/repositories/postgres-current-messaging-provider";
import { createAdmissionNotificationResourceAuthority } from "@/src/modules/notifications/infrastructure/messaging/admission-notification-resource-authority";
import { MESSAGING_DISPATCH_BOUND } from "@/src/modules/messaging/constants/messaging-dispatch";

/** @param database - This run's fully migrated disposable branch. @returns Actual preparer, marker, private credential store and provider identity under current group guards. */
export async function prepareAdmissionNotificationGroupAuthority(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareAdmissionNotificationGroupsForEmail(database);
  const readSecurityConfig = async () => fixture.keys.config;
  /** @param actorUserId - Exact contributing actor or backend collection principal. @param run - Original database-only operation. @returns Its confirmed result without a nested checkout or provider RPC. */
  const execute = <Result>(actorUserId: string | null, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext({ userId: actorUserId, email: null }, run);
  /** @param transaction - Current original transaction. @returns Actual private execution capability and exact fixture principal, without locking business rows before their owner. */
  const authorize = async (transaction: RequestDatabase) => Boolean((await transaction.execute<{ allowed: boolean }>(sql`select (public.current_app_user_id() is null or public.current_app_user_id()=${fixture.leaderId}) and has_function_privilege(current_user,'public.authorize_messaging_delivery_attempt(uuid,uuid,integer,text,text)','EXECUTE') as allowed`)).rows[0].allowed);
  const guards = createAdmissionNotificationResourceAuthority(readSecurityConfig);
  const repository = new PostgresMessageDeliveryRepository(execute, authorize, readSecurityConfig, undefined, guards.queued);
  const secrets = new PostgresEncryptedSecretStore(execute, { getAuthenticatedAccount: async () => null }, readSecurityConfig, "authorized_delivery", guards.marked);
  const provider = new PostgresCurrentMessagingProvider((context, run) => execute(context.authorizationPurpose === "authorized_delivery" ? context.contributingLeaderUserId : context.actorUserId, run), async () => ({ environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch, recoveryLocked: fixture.keys.config.recoveryLocked }), guards.marked);
  /** @returns One genuine fair lease for this fixture's next queued original. */
  const claim = async () => {
    const claims = await repository.claim({ leaseToken: randomUUID(), limit: MESSAGING_DISPATCH_BOUND.maximumBatch, leaseSeconds: MESSAGING_DISPATCH_BOUND.maximumLeaseSeconds });
    const current = claims.find((candidate) => candidate.tribeId === fixture.tribeId);
    if (!current) throw new Error("Native group authority fixture did not claim its original delivery");
    return current;
  };
  /** @param count - Independent actual sources sharing the same explicit individual preference. @returns Their confirmed complete original outbox references. */
  const queueIndividual = async (count: number) => {
    await fixture.execute((transaction) => transaction.execute(sql`insert into public.admission_notification_preferences(tribe_id,recipient_user_id,mode,version) values (${fixture.tribeId},${fixture.leaderId},'individual',1)`));
    const created = await fixture.createSources(count);
    return Promise.all(created.sources.map(async (source) => {
      const group = await fixture.collect(source.obligation_id);
      const result = await fixture.preparation.prepare(group);
      if (result.status !== "queued") throw new Error("Native group authority fixture did not prepare a complete original");
      return { ...group, deliveryId: result.deliveryId! };
    }));
  };
  /** @param deliveryId - Exact original. @returns State, charged attempts and safe audit extents; no ciphertext, contacts or credential contents. */
  const snapshot = (deliveryId: string) => fixture.execute(async (transaction) => (await transaction.execute<{ state: string; attempts: number; reservations: number; exposures: number; suppressions: number }>(sql`select delivery.state,
    (select count(*)::int from public.message_delivery_attempts where delivery_id=delivery.id) as attempts,
    (select count(*)::int from public.messaging_usage_reservations where delivery_id=delivery.id and state='consumed') as reservations,
    (select count(*)::int from public.academy_admission_audit_events where tribe_id=delivery.tribe_id and resource_id=delivery.connection_id and event_type='authorized_resource_exposure' and metadata->>'surface'='operational_secret') as exposures,
    (select count(*)::int from public.academy_admission_audit_events where tribe_id=delivery.tribe_id and resource_id=delivery.id and event_type='delivery_suppressed' and rule='authorize_notification_group') as suppressions
    from public.message_deliveries delivery where delivery.id=${deliveryId} and delivery.tribe_id=${fixture.tribeId}`)).rows[0]);
  return { ...fixture, deliveryExecute: execute, deliveryAuthorize: authorize, readSecurityConfig, guards, deliveryRepository: repository, secrets, provider, claim, queueIndividual, snapshot };
}
