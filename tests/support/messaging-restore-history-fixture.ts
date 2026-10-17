/** Reads historical candidate recovery facts on the supplied branch without retaining its parent executors. @module messaging-restore-history-fixture */
import { sql } from "drizzle-orm";
import type { MessagingRestoreSql } from "./messaging-restore-fixture";
import type { CandidateExpirationCase } from "./messaging-candidate-expiration-fixture";
import { MESSAGING_CANDIDATE_IDLE_LIFETIME_MS } from "@/src/modules/messaging/constants/messaging-secret-access";
import { MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS } from "@/src/modules/messaging/constants/messaging-candidate-expiration";

/** @param database - Exact owned parent or restored child. @param cases - Original synthetic history, never authority for a mutation. @returns Native deadline comparisons and lifecycle metadata, without key or envelope bytes. */
export function readMessagingRestoreHistory(database: MessagingRestoreSql, cases: readonly CandidateExpirationCase[]) {
  return database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute(sql`select connection.id as connection_id,connection.state,connection.is_selected,connection.is_candidate,resource.version,resource.last_activity_at::text,resource.retired_at::text,resource.purge_after::text,
    resource.retired_at=resource.last_activity_at+${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint*interval '1 millisecond' as original_idle_cutoff,
    resource.purge_after=resource.last_activity_at+(${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint+${MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS}::bigint)*interval '1 millisecond' as original_idle_purge,
    resource.retired_at<=resource.last_activity_at+${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint*interval '1 millisecond' as no_idle_extension,
    envelope.retired_at=resource.retired_at and envelope.purge_after=resource.purge_after as matching_secret_deadline,
    envelope.iv is not null and envelope.ciphertext is not null as has_material,envelope.purged_at is not null as purged
    from public.tenant_messaging_connections connection join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id join public.messaging_secret_envelopes envelope on envelope.secret_ref=resource.secret_ref
    where connection.id=any(${sql.param(cases.map((candidate) => candidate.connectionId))}::uuid[]) order by connection.id,resource.version`)).rows);
}

/** @param database - Owned parent before copying. @param tribeId - An existing synthetic historical academy. @returns After creating a coherent protected manual/OFF checkpoint; no past human activation is asserted. */
export function seedMessagingRestoreManualPolicy(database: MessagingRestoreSql, tribeId: string) {
  return database.withContext({ userId: null, email: null }, async (transaction) => {
    const now = (await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now;
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,requires_additional_verification,activated_at) values (${tribeId},true,false,${now})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
  });
}
