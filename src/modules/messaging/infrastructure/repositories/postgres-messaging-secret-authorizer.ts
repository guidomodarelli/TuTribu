/** Revalidates private credential scope under current PostgreSQL identity, resource and attempt locks. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecretAccessContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_AUTHORIZATION_PURPOSE, MESSAGING_CREDENTIAL_USABLE_STATES } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_CANDIDATE_IDLE_LIFETIME_MS, MESSAGING_SECRET_ATTEMPT_STATE, MESSAGING_SECRET_DELIVERY_SCOPE } from "@/src/modules/messaging/constants/messaging-secret-access";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

type DatabaseInstant = string | Date;
/** Contains only scope/lifetime facts; ciphertext is read separately after authorization. */
export type LockedMessagingSecret = { notBefore: readonly Date[]; expiresAt: readonly Date[]; environment: string; securityEpoch: string; keyId: string };

/** Converts the consumed timestamp without revalidating the PostgreSQL row schema. */
function instant(value: DatabaseInstant): Date { return new Date(value instanceof Date ? value.getTime() : value); }

/** Checks every locked lifetime with a clock sampled after all waits. */
export function messagingSecretLifetimeIsCurrent(authorization: LockedMessagingSecret, now: Date): boolean {
  return Number.isFinite(now.getTime()) && authorization.notBefore.every((date) => Number.isFinite(date.getTime()) && date <= now) && authorization.expiresAt.every((date) => Number.isFinite(date.getTime()) && date > now);
}

/**
 * Locks current actor/tenant/resource before inspecting any recoverable bytes.
 * @param database - Existing guarded transaction, with a server-derived actor.
 * @param context - Private scope that must be independently revalidated.
 * @returns Locked external/resource identity and the applicable time bounds.
 * @throws MessagingSecretAccessError when any current relationship is insufficient.
 */
export async function authorizeMessagingSecret(database: RequestDatabase, context: MessagingSecretAccessContext): Promise<LockedMessagingSecret> {
  const human = context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader;
  const actorUserId = human ? context.actorUserId : context.contributingLeaderUserId;
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  if (actor !== actorUserId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  const expiresAt: Date[] = [];
  const notBefore: Date[] = [];
  if (human) {
    const user = (await database.execute<{ email: string }>(sql`select email from public."user" where id=${actorUserId} for share`)).rows[0];
    const account = (await database.execute<{ subject: string }>(sql`select "accountId" as subject from public.account where id=${context.accountId} and "userId"=${actorUserId} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} for share`)).rows[0];
    const session = (await database.execute<{ expires_at: DatabaseInstant }>(sql`select "expiresAt" as expires_at from public.session where id=${context.sessionId} and "userId"=${actorUserId} for share`)).rows[0];
    if (!user || !session || account?.subject !== context.subject) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    const binding = (await database.execute(sql`select session_id from public.global_session_identity_bindings where session_id=${context.sessionId} and user_id=${actorUserId} and account_id=${context.accountId} and provider_subject=${context.subject} and normalized_email=${user.email.trim().toLowerCase()} and invalidated_at is null for share`)).rows[0];
    if (!binding) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
    expiresAt.push(instant(session.expires_at));
  }
  const tribe = (await database.execute(sql`select id from public.tribes where id=${context.tribeId} for share`)).rows[0];
  if (!tribe) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  const leaders = (await database.execute<{ user_id: string }>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
  if (leaders.length !== 1 || leaders[0].user_id !== actorUserId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  const connection = (await database.execute<{ state: string; contributed_by_user_id: string | null; environment: string; security_epoch: string; retired_at: DatabaseInstant | null; candidate_version: number | null; selected_version: number | null; is_selected: boolean; is_candidate: boolean }>(sql`select state,contributed_by_user_id,environment,security_epoch,retired_at,candidate_version,selected_version,is_selected,is_candidate from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId} for share`)).rows[0];
  if (!connection || connection.contributed_by_user_id !== actorUserId || connection.retired_at !== null || !MESSAGING_CREDENTIAL_USABLE_STATES.has(connection.state) || connection.environment !== context.environment || connection.security_epoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  const candidate = connection.is_candidate && connection.candidate_version === context.connectionVersion;
  const selected = connection.is_selected && connection.selected_version === context.connectionVersion;
  if (!candidate && !selected) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  const version = (await database.execute<{ secret_ref: string | null; last_activity_at: DatabaseInstant; retired_at: DatabaseInstant | null }>(sql`select secret_ref,last_activity_at,retired_at from public.messaging_connection_versions where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and version=${context.connectionVersion} and environment=${context.environment} and security_epoch=${context.securityEpoch} for share`)).rows[0];
  if (!version || version.secret_ref !== context.secretRef || version.retired_at !== null) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  if (candidate && !selected) expiresAt.push(new Date(instant(version.last_activity_at).getTime() + MESSAGING_CANDIDATE_IDLE_LIFETIME_MS));
  if (human) {
    const evidence = (await database.execute<{ authenticated_at: DatabaseInstant; valid_until: DatabaseInstant }>(sql`select authenticated_at,valid_until from public.recent_authentication_evidence where user_id=${actorUserId} and session_id=${context.sessionId} and account_id=${context.accountId} and provider_subject=${context.subject} and tribe_id=${context.tribeId} and operation=${context.operation} and resource_id=${context.resourceId} and authenticated_at=${context.authenticatedAt} and valid_until=${context.validUntil} and invalidated_at is null limit 1 for share`)).rows[0];
    if (!evidence || instant(evidence.authenticated_at).getTime() !== context.authenticatedAt.getTime() || instant(evidence.valid_until).getTime() !== context.validUntil.getTime()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
    notBefore.push(instant(evidence.authenticated_at));
    expiresAt.push(instant(evidence.valid_until));
  } else {
    const delivery = (await database.execute<{ state: string; purpose: string; lease_token: string | null; lease_until: DatabaseInstant | null; deadline_at: DatabaseInstant }>(sql`select state,purpose,lease_token,lease_until,deadline_at from public.message_deliveries where id=${context.deliveryId} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and environment=${context.environment} and security_epoch=${context.securityEpoch} for share`)).rows[0];
    const attempt = (await database.execute<{ id: string; state: string; version: number; lease_token: string; send_authorized_at: DatabaseInstant; authorized_usage_policy_version: number; reservation_id: string }>(sql`select id,state,version,lease_token,send_authorized_at,authorized_usage_policy_version,reservation_id from public.message_delivery_attempts where id=${context.attemptId} and delivery_id=${context.deliveryId} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} for share`)).rows[0];
    if (!delivery || !attempt || delivery.state !== MESSAGING_SECRET_ATTEMPT_STATE.queued || attempt.state !== MESSAGING_SECRET_ATTEMPT_STATE.inFlight || attempt.version !== context.attemptVersion || attempt.lease_token !== context.leaseToken || delivery.lease_token !== context.leaseToken || !delivery.lease_until || attempt.authorized_usage_policy_version !== context.authorizedUsagePolicyVersion || instant(attempt.send_authorized_at).getTime() !== context.sendAuthorizedAt.getTime()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    if (delivery.purpose !== MESSAGING_SECRET_DELIVERY_SCOPE.diagnostic && (!selected || (connection.state !== MESSAGING_SECRET_DELIVERY_SCOPE.active && connection.state !== MESSAGING_SECRET_DELIVERY_SCOPE.degraded))) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    const reservation = (await database.execute(sql`select id from public.messaging_usage_reservations where id=${attempt.reservation_id} and attempt_id=${attempt.id} and delivery_id=${context.deliveryId} and tribe_id=${context.tribeId} and state=${MESSAGING_SECRET_ATTEMPT_STATE.consumed} for share`)).rows[0];
    if (!reservation) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    notBefore.push(instant(attempt.send_authorized_at));
    expiresAt.push(instant(delivery.lease_until), instant(delivery.deadline_at));
  }
  const envelope = (await database.execute<{ environment: string; security_epoch: string; key_id: string }>(sql`select environment,security_epoch,key_id from public.messaging_secret_envelopes where secret_ref=${context.secretRef} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and environment=${context.environment} and security_epoch=${context.securityEpoch} and retired_at is null for share`)).rows[0];
  if (!envelope) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  return { environment: envelope.environment, securityEpoch: envelope.security_epoch, keyId: envelope.key_id, expiresAt, notBefore };
}
