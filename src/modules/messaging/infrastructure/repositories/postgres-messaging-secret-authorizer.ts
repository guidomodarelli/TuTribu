/** Revalidates private credential scope under current PostgreSQL identity, resource and attempt locks. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecretAccessContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingSecretAccessError, type MessagingSecretAccessErrorCode } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_AUTHORIZATION_PURPOSE, MESSAGING_CREDENTIAL_USABLE_STATES } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_CANDIDATE_IDLE_LIFETIME_MS, MESSAGING_SECRET_ATTEMPT_STATE, MESSAGING_SECRET_DELIVERY_SCOPE } from "@/src/modules/messaging/constants/messaging-secret-access";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { MarkedMessageDeliveryResourceAuthority } from "../message-delivery-resource-authority";

type DatabaseInstant = string | Date;
/** Contains only scope/lifetime facts; ciphertext is read separately after authorization. A human scope also keeps its locked session deadline. */
export type LockedMessagingSecret = { notBefore: readonly Date[]; expiresAt: readonly Date[]; sessionExpiresAt?: Date; environment: string; securityEpoch: string; keyId: string; providerId: string };

/** Facts a reusable check locked, plus the identity binding email a human check matched. */
type HeldMessagingSecretAuthority = { facts: LockedMessagingSecret; normalizedEmail?: string };
/** Only transactions opened through `withReusedMessagingSecretAuthority` register here; each entry maps a human or worker scope key to the facts its full check locked, and dies with its scope. */
const heldMessagingSecretAuthority = new WeakMap<RequestDatabase, Map<string, HeldMessagingSecretAuthority>>();

/**
 * Lets repeated checks of one transaction reuse the locks its first full check took.
 *
 * A full check locks, `FOR SHARE` and in this order, the human identity (user, Google account,
 * session and its identity binding) when it is a human check, then the tribe, its active leaders,
 * the connection, the connection version, the worker's delivery, attempt and usage reservation, and
 * the secret envelope. Nobody else can update or delete those rows before COMMIT, so a later check of
 * the same scope re-reads, in one statement, only what the locks cannot freeze: the transaction
 * actor, the leadership (a new active leader row is not blocked by the existing row locks) and the
 * lifetime that runs against the database clock, the delivery lease for a worker and the session
 * expiry for a human. A human reuse also re-reads that its identity binding was not invalidated,
 * which a write of the same transaction could do. A grouped notification keeps running its injected
 * business guard on every check, and write-locked checks never reuse. The scope must not contain a
 * savepoint: a `ROLLBACK TO SAVEPOINT` would release locks taken after it.
 *
 * @param database - Transaction of the owner, without savepoints.
 * @param run - The owner's work in that transaction.
 * @returns Its result; the held authority is forgotten when it settles.
 */
export async function withReusedMessagingSecretAuthority<Result>(database: RequestDatabase, run: () => Promise<Result>): Promise<Result> {
  if (heldMessagingSecretAuthority.has(database)) return run();
  heldMessagingSecretAuthority.set(database, new Map());
  try { return await run(); } finally { heldMessagingSecretAuthority.delete(database); }
}

/** Where a check of a reuse scope finds or registers its held facts. */
type HeldMessagingSecretSlot = { entries: Map<string, HeldMessagingSecretAuthority>; key: string };

/**
 * @param database - Current transaction.
 * @param context - Human or worker scope.
 * @returns The scope's slot for this context, keyed by every fact the full check compares against locked rows, or null outside a reuse scope.
 */
function readHeldMessagingSecretSlot(database: RequestDatabase, context: MessagingSecretAccessContext): HeldMessagingSecretSlot | null {
  const entries = heldMessagingSecretAuthority.get(database);
  if (!entries) return null;
  const resource = [context.tribeId, context.connectionId, context.connectionVersion, context.environment, context.securityEpoch, context.secretRef, context.operation];
  const key = context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader
    ? JSON.stringify([context.authorizationPurpose, context.actorUserId, context.sessionId, context.accountId, context.subject, context.resourceId, ...resource])
    : JSON.stringify([context.authorizationPurpose, context.contributingLeaderUserId, ...resource, context.deliveryId, context.deliveryPurpose, context.notificationGroupId, context.attemptId, context.attemptVersion, context.leaseToken, context.sendAuthorizedAt.getTime(), context.authorizedUsagePolicyVersion]);
  return { entries, key };
}

/**
 * @param context - Human or worker scope.
 * @param actorUserId - Actor the full check matched.
 * @param held - Facts locked by the full check.
 * @returns A boolean SQL expression for the lifetime the locks cannot freeze: a live session with its binding still valid, or a live delivery lease.
 */
function heldLifetimeIsLive(context: MessagingSecretAccessContext, actorUserId: string, held: HeldMessagingSecretAuthority) {
  if (context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader) return sql`(select session."expiresAt">clock_timestamp() and exists(select 1 from public.global_session_identity_bindings binding where binding.session_id=session.id and binding.user_id=${actorUserId} and binding.account_id=${context.accountId} and binding.provider_subject=${context.subject} and binding.normalized_email=${held.normalizedEmail ?? null} and binding.invalidated_at is null) from public.session session where session.id=${context.sessionId} and session."userId"=${actorUserId})`;
  return sql`(select delivery.lease_until>clock_timestamp() from public.message_deliveries delivery where delivery.id=${context.deliveryId} and delivery.tribe_id=${context.tribeId} and delivery.lease_token=${context.leaseToken})`;
}

/**
 * Revalidates, in one statement, what the held row locks cannot freeze.
 * @param database - Transaction that already holds this scope's locks.
 * @param context - Human or worker scope.
 * @param held - Facts locked by the full check.
 * @returns The held facts.
 * @throws MessagingSecretAccessError for another actor, an ended session or invalidated binding, a changed leadership or an expired lease.
 */
async function reuseHeldMessagingSecretAuthority(database: RequestDatabase, context: MessagingSecretAccessContext, held: HeldMessagingSecretAuthority): Promise<LockedMessagingSecret> {
  const human = context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader;
  const actorUserId = human ? context.actorUserId : context.contributingLeaderUserId;
  const current = (await database.execute<{ actor: string | null; leaders: string[] | null; live: boolean | null }>(sql`select public.current_app_user_id() as actor,(select array_agg(member.user_id order by member.user_id) from public.tribe_members member where member.tribe_id=${context.tribeId} and member.role=${TRIBE_MEMBER_ROLE.leader} and member.status=${TRIBE_MEMBERSHIP_STATUS.active}) as leaders,${heldLifetimeIsLive(context, actorUserId, held)} as live`)).rows[0];
  if (current?.actor !== actorUserId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  // The full check verifies the human identity before the leadership, so an ended session wins over a lost role here too.
  if (human && current.live !== true) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
  if (current.leaders?.length !== 1 || current.leaders[0] !== actorUserId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  if (current.live !== true) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  return held.facts;
}

/** Converts the consumed timestamp without revalidating the PostgreSQL row schema. */
function instant(value: DatabaseInstant): Date { return new Date(value instanceof Date ? value.getTime() : value); }

/** Checks every locked lifetime with a clock sampled after all waits. */
export function messagingSecretLifetimeIsCurrent(authorization: LockedMessagingSecret, now: Date): boolean {
  return Number.isFinite(now.getTime()) && authorization.notBefore.every((date) => Number.isFinite(date.getTime()) && date <= now) && authorization.expiresAt.every((date) => Number.isFinite(date.getTime()) && date > now);
}

/**
 * Names the failed bound of a lifetime that is no longer current.
 * @param authorization - Locked lifetime facts from {@link authorizeMessagingSecret}.
 * @param now - Clock sampled after every wait.
 * @returns `authentication_required` when the human session ended; otherwise the resource lifetime closed.
 */
export function messagingSecretLifetimeFailure(authorization: LockedMessagingSecret, now: Date): MessagingSecretAccessErrorCode {
  const sessionEnded = authorization.sessionExpiresAt !== undefined && !(Number.isFinite(now.getTime()) && authorization.sessionExpiresAt > now);
  return sessionEnded ? MESSAGING_ERROR_CODE.authenticationRequired : MESSAGING_ERROR_CODE.resourceUnavailable;
}

/**
 * Locks current actor/tenant/resource before inspecting any recoverable bytes.
 * @param database - Existing guarded transaction, with a server-derived actor.
 * @param context - Private scope that must be independently revalidated.
 * @param lockResourcesForWrite - Acquires exclusive resource locks immediately for a DB-only metadata mutation, avoiding shared-lock upgrades.
 * @param authorizeDeliveryResource - Injected current whole-resource guard for explicitly grouped worker intents; absence closes that resource.
 * @returns Locked external/resource identity and the applicable time bounds.
 * @throws MessagingSecretAccessError when any current relationship is insufficient.
 */
export async function authorizeMessagingSecret(database: RequestDatabase, context: MessagingSecretAccessContext, lockResourcesForWrite = false, authorizeDeliveryResource?: MarkedMessageDeliveryResourceAuthority): Promise<LockedMessagingSecret> {
  const human = context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader;
  const actorUserId = human ? context.actorUserId : context.contributingLeaderUserId;
  const slot = lockResourcesForWrite ? null : readHeldMessagingSecretSlot(database, context);
  const held = slot?.entries.get(slot.key);
  if (held) return reuseHeldMessagingSecretAuthority(database, context, held);
  let grouped = false;
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  if (actor !== actorUserId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  if (!human) {
    const source = (await database.execute<{ purpose: string; notification_group_id: string | null; notification_group_audience: string | null }>(sql`select purpose,notification_group_id,notification_group_audience from public.message_deliveries where id=${context.deliveryId} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and environment=${context.environment} and security_epoch=${context.securityEpoch}`)).rows[0];
    if (!source || source.purpose !== context.deliveryPurpose || source.notification_group_id !== context.notificationGroupId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    if (source && (source.notification_group_id !== null || source.notification_group_audience !== null)) {
      grouped = true;
      if (!authorizeDeliveryResource) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      // The injected owner takes its exclusive tribe/policy fence before the generic shared locks below.
      await authorizeDeliveryResource(database, context);
    }
  }
  const expiresAt: Date[] = [];
  const notBefore: Date[] = [];
  let sessionExpiresAt: Date | undefined, normalizedEmail: string | undefined;
  if (human) {
    const user = (await database.execute<{ email: string }>(sql`select email from public."user" where id=${actorUserId} for share`)).rows[0];
    const account = (await database.execute<{ subject: string }>(sql`select "accountId" as subject from public.account where id=${context.accountId} and "userId"=${actorUserId} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} for share`)).rows[0];
    const session = (await database.execute<{ expires_at: DatabaseInstant }>(sql`select "expiresAt" as expires_at from public.session where id=${context.sessionId} and "userId"=${actorUserId} for share`)).rows[0];
    if (!user || !session || account?.subject !== context.subject) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    normalizedEmail = user.email.trim().toLowerCase();
    const binding = (await database.execute(sql`select session_id from public.global_session_identity_bindings where session_id=${context.sessionId} and user_id=${actorUserId} and account_id=${context.accountId} and provider_subject=${context.subject} and normalized_email=${normalizedEmail} and invalidated_at is null for share`)).rows[0];
    // The binding is created at Google sign-in; without it this session cannot reach credentials.
    if (!binding) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    sessionExpiresAt = instant(session.expires_at);
    expiresAt.push(sessionExpiresAt);
  }
  const tribe = (await database.execute(sql`select id from public.tribes where id=${context.tribeId} for share`)).rows[0];
  if (!tribe) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  const leaders = (await database.execute<{ user_id: string }>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
  if (leaders.length !== 1 || leaders[0].user_id !== actorUserId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  const resourceLock=lockResourcesForWrite?sql`for update`:sql`for share`;
  const connection = (await database.execute<{ provider: string; state: string; contributed_by_user_id: string | null; environment: string; security_epoch: string; retired_at: DatabaseInstant | null; candidate_version: number | null; selected_version: number | null; is_selected: boolean; is_candidate: boolean }>(sql`select provider,state,contributed_by_user_id,environment,security_epoch,retired_at,candidate_version,selected_version,is_selected,is_candidate from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId} ${resourceLock}`)).rows[0];
  if (!connection || connection.contributed_by_user_id !== actorUserId || connection.retired_at !== null || !MESSAGING_CREDENTIAL_USABLE_STATES.has(connection.state) || connection.environment !== context.environment || connection.security_epoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  const candidate = connection.is_candidate && connection.candidate_version === context.connectionVersion;
  const selected = connection.is_selected && connection.selected_version === context.connectionVersion;
  if (!candidate && !selected) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  const version = (await database.execute<{ secret_ref: string | null; last_activity_at: DatabaseInstant; retired_at: DatabaseInstant | null }>(sql`select secret_ref,last_activity_at,retired_at from public.messaging_connection_versions where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and version=${context.connectionVersion} and environment=${context.environment} and security_epoch=${context.securityEpoch} ${resourceLock}`)).rows[0];
  if (!version || version.secret_ref !== context.secretRef || version.retired_at !== null) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  if (candidate && !selected) expiresAt.push(new Date(instant(version.last_activity_at).getTime() + MESSAGING_CANDIDATE_IDLE_LIFETIME_MS));
  if (!human) {
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
  const facts: LockedMessagingSecret = { environment: envelope.environment, securityEpoch: envelope.security_epoch, keyId: envelope.key_id, providerId: connection.provider, expiresAt, notBefore, ...(sessionExpiresAt ? { sessionExpiresAt } : {}) };
  // A grouped notification keeps its injected business guard on every check, so it never registers.
  if (slot && !grouped) slot.entries.set(slot.key, { facts, ...(normalizedEmail === undefined ? {} : { normalizedEmail }) });
  return facts;
}
