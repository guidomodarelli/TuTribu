/** Reads exact group identity and current member facts inside the original authorized tribe transaction. @module admission-notification-group-reader */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_NOTIFICATION_TIMING } from "../../constants/admission-notification-groups";
import { ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE, ADMISSION_NOTIFICATION_GROUP_STATE } from "../../constants/admission-notification-group-storage";
import type { AdmissionNotificationStoredGroup, AdmissionNotificationGroupMemberState, AdmissionNotificationGroupState } from "../../domain/entities/admission-notification-group";
import type { AdmissionNotificationAudience, AdmissionNotificationCandidatePlan, AdmissionNotificationEmailFacts, AdmissionNotificationGroupManifest, AdmissionNotificationSuppressionReason } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationPreferenceMode } from "../../domain/entities/admission-notification-preference";
import { planAdmissionNotificationEmailCandidate } from "../../domain/policies/admission-notification-groups";
import type { AdmissionNotificationCollectionAuthorizer } from "./postgres-admission-notification-collection-progress";
import { PostgresAdmissionNotificationRecipientEmailReader } from "./postgres-admission-notification-recipient-email-reader";

/** @param lock - Requested row lock. @returns The locking clause of the group read. */
function groupLockClause(lock: "update" | "share" | null | undefined) {
  if (lock === "update") return sql`for update`;
  return lock === "share" ? sql`for share` : sql``;
}

/** Consumes selected native columns without schema validation or Date conversion. */
type GroupRow = { id: string; tribe_id: string; recipient_user_id: string; audience: AdmissionNotificationAudience; mode: Exclude<AdmissionNotificationPreferenceMode, "omitted">; preference_version: number; email_settings_version: number; time_zone: string; starts_microseconds: string; closes_microseconds: string; individual_obligation_id: string | null; state: AdmissionNotificationGroupState; version: number; frozen_manifest: AdmissionNotificationGroupManifest | null; deadline_microseconds: string | null; suppression_reason: AdmissionNotificationSuppressionReason | null; closed_microseconds: string | null; created_microseconds: string };
/** Retains a member even when its original notice is no longer available. */
type MemberRow = { obligation_id: string; state: AdmissionNotificationGroupMemberState; request_id: string; applicant_user_id: string; event_type: AdmissionNotificationEmailFacts["source"]["event"]; created_microseconds: string; request_status: string; submitted_microseconds: string; expires_microseconds: string };
/** Keeps current tested payer/resource metadata private, without loading its secret. */
export type AdmissionNotificationPreparedResource = { connectionId: string; connectionVersion: number; contributingLeaderUserId: string; senderId: string; queuedUsagePolicyVersion: number; credentialKeyId: string };
/** Preserves each original member's independent current plan and destination evidence. */
export type AdmissionNotificationCurrentGroupMember = { obligationId: string; deadlineAtMicroseconds: number; plan: AdmissionNotificationCandidatePlan; normalizedEmail: string | null };

/** @param database - Existing authorized owner transaction. @returns Exact safe native microseconds sampled after the caller's waits. */
export async function admissionNotificationNow(database: RequestDatabase): Promise<number> {
  return Number((await database.execute<{ instant: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as instant`)).rows[0].instant);
}

/** @param database - Existing authorized transaction. @param tribeId - Exact tenant. @param groupId - Existing opaque group. @param lock - Native lock selected after preceding canonical source locks, or a locator read. @returns Exact native identity or genuine absence; this metadata never grants send authority. */
export async function readAdmissionNotificationGroup(database: RequestDatabase, tribeId: string, groupId: string, lock: "share" | "update" | null = null): Promise<AdmissionNotificationStoredGroup | null> {
  const row = (await database.execute<GroupRow>(sql`select id,tribe_id,recipient_user_id,audience,mode,preference_version,email_settings_version,time_zone,
    (extract(epoch from window_starts_at)*${MICROSECONDS_PER_SECOND})::bigint::text as starts_microseconds,
    (extract(epoch from window_closes_at)*${MICROSECONDS_PER_SECOND})::bigint::text as closes_microseconds,
    individual_obligation_id,state,version,frozen_manifest,(extract(epoch from deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as deadline_microseconds,
    suppression_reason,(extract(epoch from closed_at)*${MICROSECONDS_PER_SECOND})::bigint::text as closed_microseconds,
    (extract(epoch from created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_microseconds
    from public.admission_notification_groups where id=${groupId} and tribe_id=${tribeId} ${groupLockClause(lock)}`)).rows[0];
  return row ? { id: row.id, identity: { tribeId: row.tribe_id, recipientUserId: row.recipient_user_id, audience: row.audience, mode: row.mode, preferenceVersion: row.preference_version, emailSettingsVersion: row.email_settings_version, individualObligationId: row.individual_obligation_id, window: { startsAtMicroseconds: Number(row.starts_microseconds), closesAtMicroseconds: Number(row.closes_microseconds), timeZone: row.time_zone } }, state: row.state, version: row.version, frozenManifest: row.frozen_manifest, deadlineAtMicroseconds: row.deadline_microseconds === null ? null : Number(row.deadline_microseconds), suppressionReason: row.suppression_reason, closedAtMicroseconds: row.closed_microseconds === null ? null : Number(row.closed_microseconds), createdAtMicroseconds: Number(row.created_microseconds) } : null;
}

/** Holds canonical current facts before the freezer locks and resolves the original group. */
export class PostgresAdmissionNotificationGroupReader {
  /** @param database - Original guarded transaction, already holding the exclusive tribe fence. @param authorize - Current DB-only backend purpose. @param readSecurityConfig - Live local external epoch and keys; no RPC under locks. */
  constructor(private readonly database: RequestDatabase, private readonly authorize: AdmissionNotificationCollectionAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param group - Existing original scoped identity. @returns Every current member plan and exact prepared resource, without dispatch authority or protected material. */
  async read(group: AdmissionNotificationStoredGroup): Promise<{ group: AdmissionNotificationStoredGroup | null; members: AdmissionNotificationCurrentGroupMember[]; resource: AdmissionNotificationPreparedResource | null; nowMicroseconds: number }> {
    const identity = group.identity, tribeId = identity.tribeId, frozen = group.state === ADMISSION_NOTIFICATION_GROUP_STATE.frozen;
    const memberState = frozen ? ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.included : ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.pending;
    const locators = (await this.database.execute<{ obligation_id: string; request_id: string }>(sql`select member.obligation_id,obligation.request_id from public.admission_notification_group_members member join public.academy_admission_notification_obligations obligation on obligation.id=member.obligation_id and obligation.tribe_id=member.tribe_id where member.group_id=${group.id} and member.tribe_id=${tribeId} and member.state=${memberState} order by obligation.request_id,member.obligation_id`)).rows;
    const emails = new Map<string, string>();
    const reader = new PostgresAdmissionNotificationRecipientEmailReader(this.database, async () => { const config = await this.readSecurityConfig(); return { environment: config.environment, securityEpoch: config.securityEpoch }; });
    // Pin shared identity once and every original request/source/notice before group/member locks.
    const destinations = await reader.readBatch({ tribeId, obligationIds: locators.map((locator) => locator.obligation_id), recipientUserId: identity.recipientUserId, audience: identity.audience });
    for (const [obligationId, destination] of destinations) emails.set(obligationId, destination.normalizedEmail);
    if (locators.length) {
      await this.database.execute(sql`select id from public.academy_admission_requests where tribe_id=${tribeId} and id in (${sql.join(locators.map((locator) => sql`${locator.request_id}`), sql`,`)}) order by id for share`);
      await this.database.execute(sql`select id from public.academy_admission_notification_obligations where tribe_id=${tribeId} and id in (${sql.join(locators.map((locator) => sql`${locator.obligation_id}`), sql`,`)}) order by id for share`);
    }
    const membership = (await this.database.execute<{ role: string; status: string }>(sql`select role,status from public.tribe_members where tribe_id=${tribeId} and user_id=${identity.recipientUserId} for share`)).rows[0];
    const settings = (await this.database.execute<{ enabled: boolean; version: number; enabled_microseconds: string | null; time_zone: string }>(sql`select enabled,version,(extract(epoch from enabled_at)*${MICROSECONDS_PER_SECOND})::bigint::text as enabled_microseconds,time_zone from public.admission_email_settings where tribe_id=${tribeId} for share`)).rows[0];
    const preference = (await this.database.execute<{ mode: AdmissionNotificationPreferenceMode; version: number; effective_microseconds: string }>(sql`select mode,version,(extract(epoch from effective_from)*${MICROSECONDS_PER_SECOND})::bigint::text as effective_microseconds from public.admission_notification_preferences where tribe_id=${tribeId} and recipient_user_id=${identity.recipientUserId} for share`)).rows[0];
    const selected = (await this.database.execute<{ id: string; selected_version: number; contributed_by_user_id: string }>(sql`select id,selected_version,contributed_by_user_id from public.tenant_messaging_connections where tribe_id=${tribeId} and is_selected and retired_at is null order by id for share`)).rows[0];
    const readiness = await new PostgresAdmissionVerificationReadinessReader(this.database, this.authorize, this.readSecurityConfig).read({ tribeId, connectionId: selected?.id ?? null, connectionVersion: selected?.selected_version ?? null, channel: MESSAGING_PUBLIC_CHANNEL.email, requiresSmsAlternative: false });
    const resourceRow = selected ? (await this.database.execute<{ email_sender_id: string | null }>(sql`select email_sender_id from public.messaging_connection_versions where connection_id=${selected.id} and tribe_id=${tribeId} and version=${selected.selected_version} for share`)).rows[0] : null;
    const usage = (await this.database.execute<{ version: number }>(sql`select version from public.messaging_usage_policies where tribe_id=${tribeId} for share`)).rows[0];
    const config = await this.readSecurityConfig(), security = readiness.securityScope;
    const prepared = Boolean(readiness.channelPrepared && security && !config.recoveryLocked && security.environment === config.environment && security.securityEpoch === config.securityEpoch && config.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(security.credentialKeyId));
    const resource: AdmissionNotificationPreparedResource | null = prepared && security && selected && resourceRow?.email_sender_id && usage ? { connectionId: selected.id, connectionVersion: selected.selected_version, contributingLeaderUserId: selected.contributed_by_user_id, senderId: resourceRow.email_sender_id, queuedUsagePolicyVersion: usage.version, credentialKeyId: security.credentialKeyId } : null;
    const lockedGroup = await readAdmissionNotificationGroup(this.database, tribeId, group.id, frozen ? "share" : "update");
    await this.database.execute(sql`select obligation_id from public.admission_notification_group_members where group_id=${group.id} order by obligation_id ${frozen ? sql`for share` : sql`for update`}`);
    const sources = (await this.database.execute<MemberRow>(sql`select member.obligation_id,member.state,obligation.request_id,obligation.applicant_user_id,obligation.event_type,
      (extract(epoch from obligation.created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_microseconds,request.status as request_status,
      (extract(epoch from request.submitted_at)*${MICROSECONDS_PER_SECOND})::bigint::text as submitted_microseconds,(extract(epoch from request.expires_at)*${MICROSECONDS_PER_SECOND})::bigint::text as expires_microseconds
      from public.admission_notification_group_members member join public.academy_admission_notification_obligations obligation on obligation.id=member.obligation_id and obligation.tribe_id=member.tribe_id
      join public.academy_admission_requests request on request.id=obligation.request_id and request.tribe_id=obligation.tribe_id and request.user_id=obligation.applicant_user_id
      where member.group_id=${group.id} and member.tribe_id=${tribeId} and member.state=${memberState} order by member.obligation_id`)).rows;
    const nowMicroseconds = await admissionNotificationNow(this.database);
    const members = sources.map((source): AdmissionNotificationCurrentGroupMember => ({ obligationId: source.obligation_id, deadlineAtMicroseconds: Number(source.created_microseconds) + ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds, normalizedEmail: emails.get(source.obligation_id) ?? null, plan: planAdmissionNotificationEmailCandidate({
      source: { id: source.obligation_id, tribeId, admissionRequestId: source.request_id, applicantUserId: source.applicant_user_id, event: source.event_type, createdAtMicroseconds: Number(source.created_microseconds) },
      request: { id: source.request_id, tribeId, applicantUserId: source.applicant_user_id, status: source.request_status, submittedAtMicroseconds: Number(source.submitted_microseconds), expiresAtMicroseconds: Number(source.expires_microseconds) },
      recipient: { userId: identity.recipientUserId, audience: identity.audience, currentRole: membership?.role ?? null, membershipStatus: membership?.status ?? null, preference: preference ? { tribeId, recipientUserId: identity.recipientUserId, mode: preference.mode, version: preference.version, effectiveFromMicroseconds: Number(preference.effective_microseconds) } : null },
      emailSettings: { tribeId, enabled: settings?.enabled ?? false, version: settings?.version ?? 0, enabledAtMicroseconds: settings?.enabled_microseconds ? Number(settings.enabled_microseconds) : null, timeZone: settings?.time_zone ?? identity.window.timeZone },
      availability: { tribeId, recipientUserId: identity.recipientUserId, trustedAccountEmailAvailable: emails.has(source.obligation_id), preparedEmailConnectionAvailable: resource !== null },
      nowMicroseconds, dailyWindow: null,
    }, identity) }));
    return { group: lockedGroup, members, resource, nowMicroseconds };
  }
}
