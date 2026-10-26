/** Reads safe restore metadata through a guarded SQL capability, without seed or CLI dependencies. */
import { sql } from "drizzle-orm";
import type { MessagingRestoreSql } from "./messaging-restore-composition";
import { MESSAGING_CANDIDATE_IDLE_LIFETIME_MS } from "@/src/modules/messaging/constants/messaging-secret-access";
import { MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS } from "@/src/modules/messaging/constants/messaging-candidate-expiration";

/** @param database - Exact owned SQL capability. @param context - Fixed actor and resource. @returns State and byte availability without credential or envelope bytes. */
export function readMessagingRestoreFacts(database: MessagingRestoreSql, context: { actorUserId: string; tribeId: string; connectionId: string }) {
  return database.withContext({ userId: context.actorUserId, email: null }, async (transaction) => ({
    connection: (await transaction.execute(sql`select id,state,version,is_selected,selected_version,retired_at from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId}`)).rows[0],
    versions: (await transaction.execute(sql`select version,retired_at,purge_after from public.messaging_connection_versions where connection_id=${context.connectionId} and tribe_id=${context.tribeId} order by version`)).rows,
    secret: (await transaction.execute(sql`select connection_version,retired_at,purge_after,purged_at,octet_length(ciphertext)>0 as has_bytes from public.messaging_secret_envelopes where connection_id=${context.connectionId} and tribe_id=${context.tribeId} order by connection_version`)).rows,
    deliveries: (await transaction.execute(sql`select id,state,connection_id,connection_version from public.message_deliveries where connection_id=${context.connectionId} and tribe_id=${context.tribeId} order by id`)).rows,
    attempts: (await transaction.execute(sql`select attempt.id,attempt.delivery_id,attempt.state,attempt.connection_id,attempt.connection_version from public.message_delivery_attempts attempt where attempt.connection_id=${context.connectionId} and attempt.tribe_id=${context.tribeId} order by attempt.id`)).rows,
  }));
}

/** @param database - Exact owned SQL capability. @param tribeId - Prepared synthetic academy. @param applicants - Only this cohort's accounts. @returns Original proof/outbox/accounting metadata, without contact or code material. */
export function readRestoreAdmissionFacts(database: MessagingRestoreSql, tribeId: string, applicants: readonly string[]) {
  return database.withContext({ userId: null, email: null }, async (transaction) => ({
    policy: (await transaction.execute(sql`select version,verification_epoch,is_open,requires_additional_verification,messaging_connection_id,messaging_connection_version,activated_at from public.academy_admission_policies where tribe_id=${tribeId}`)).rows[0],
    requests: (await transaction.execute(sql`select id,user_id,status,version,proof_id,submitted_at,expires_at from public.academy_admission_requests where tribe_id=${tribeId} order by id`)).rows,
    proofs: (await transaction.execute(sql`select id,status,verification_epoch,security_epoch,applied_request_id,apply_before,invalidated_at,invalidation_reason from public.academy_admission_verification_proofs where tribe_id=${tribeId} order by id`)).rows,
    challenges: (await transaction.execute(sql`select id,user_id,state,is_current,verification_epoch,security_epoch,expires_at,delivery_id,invalidated_at from public.contact_verification_challenges where tribe_id=${tribeId} order by id`)).rows,
    deliveries: (await transaction.execute(sql`select id,source_resource_id,state,connection_id,connection_version,security_epoch from public.message_deliveries where tribe_id=${tribeId} order by id`)).rows,
    attempts: (await transaction.execute(sql`select id,delivery_id,state,reservation_id,connection_id,connection_version from public.message_delivery_attempts where tribe_id=${tribeId} order by id`)).rows,
    reservations: (await transaction.execute(sql`select id,delivery_id,attempt_id,state,reserved_at,released_at from public.messaging_usage_reservations where tribe_id=${tribeId} order by id`)).rows,
    memberships: (await transaction.execute(sql`select user_id,role,status from public.tribe_members where tribe_id=${tribeId} and user_id=any(${sql.param(applicants)}::text[]) order by user_id`)).rows,
  }));
}

/** @param database - Exact owned SQL capability. @param cases - Original resource references, never permission to mutate them. @returns Native deadline and lifecycle comparisons without key or envelope bytes. */
export function readMessagingRestoreHistory(database: MessagingRestoreSql, cases: readonly { connectionId: string }[]) {
  return database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute(sql`select connection.id as connection_id,connection.state,connection.is_selected,connection.is_candidate,resource.version,resource.last_activity_at::text,resource.retired_at::text,resource.purge_after::text,
    resource.retired_at=resource.last_activity_at+${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint*interval '1 millisecond' as original_idle_cutoff,
    resource.purge_after=resource.last_activity_at+(${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint+${MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS}::bigint)*interval '1 millisecond' as original_idle_purge,
    resource.retired_at<=resource.last_activity_at+${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint*interval '1 millisecond' as no_idle_extension,
    envelope.retired_at=resource.retired_at and envelope.purge_after=resource.purge_after as matching_secret_deadline,
    envelope.iv is not null and envelope.ciphertext is not null as has_material,envelope.purged_at is not null as purged
    from public.tenant_messaging_connections connection join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id join public.messaging_secret_envelopes envelope on envelope.secret_ref=resource.secret_ref
    where connection.id=any(${sql.param(cases.map((candidate) => candidate.connectionId))}::uuid[]) order by connection.id,resource.version`)).rows);
}

