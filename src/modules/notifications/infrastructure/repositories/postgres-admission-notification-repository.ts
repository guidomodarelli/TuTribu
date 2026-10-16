/** Collects one existing original notice through current native owner facts without creating any external delivery. @module postgres-admission-notification-repository */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { ADMISSION_NOTIFICATION_COLLECTED, ADMISSION_NOTIFICATION_COLLECTION_EXISTING, ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE, ADMISSION_NOTIFICATION_COLLECTION_BUCKET_CLOSED } from "../../constants/admission-notification-collection";
import { ADMISSION_NOTIFICATION_GROUP_STATE } from "../../constants/admission-notification-group-storage";
import { ADMISSION_NOTIFICATION_GROUP_REASON, ADMISSION_NOTIFICATION_GROUP_STATUS, ADMISSION_NOTIFICATION_TIMING } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationRepository, AdmissionNotificationCollectionResult } from "../../domain/repositories/admission-notification-repository";
import type { AdmissionNotificationRecipientEmailScope } from "../../domain/entities/admission-notification-recipient-email";
import type { AdmissionNotificationEmailFacts, AdmissionNotificationGroupIdentity } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationGroupMemberState } from "../../domain/entities/admission-notification-group";
import { planAdmissionNotificationEmailCandidate } from "../../domain/policies/admission-notification-groups";
import { ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE } from "../../constants/admission-notification-source-selection";
import { AdmissionNotificationCollectionReader, type AdmissionNotificationCollectionFacts } from "./admission-notification-collection-reader";
import { createPostgresAdmissionNotificationCalendar } from "./postgres-admission-notification-calendar";
import { admissionNotificationTimestamp } from "../database/admission-notification-timestamp";

/** Consumes only selected original native fields; database rows are not schema-validated. */
type SourceRow = { id: string; request_id: string; applicant_user_id: string; event_type: AdmissionNotificationEmailFacts["source"]["event"]; created_at_microseconds: string; status: string; submitted_at_microseconds: string; expires_at_microseconds: string };
/** Requires current backend-purpose authority without taking domain locks before the tribe fence. */
type CollectionAuthorizer = (database: RequestDatabase, tribeId: string) => Promise<boolean>;

/** Keeps source collection inside the caller's short transaction; no SDK, credential decryption or outbox side effect exists here. */
export class PostgresAdmissionNotificationRepository implements AdmissionNotificationRepository {
  /** @param database - Original guarded owner transaction whose executor confirms commit or rolls back failures. @param authorize - Current backend-purpose scope, repeated after waits and before returning. @param readSecurityConfig - Live local external epoch/key availability, never a provider call. */
  constructor(private readonly database: RequestDatabase, private readonly authorize: CollectionAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param tribeId - Exact existing native tenant. @returns After current backend authority is rechecked. @throws A closed permission denial before reading private facts. */
  private async assertAuthorized(tribeId: string): Promise<void> {
    if (!await this.authorize(this.database, tribeId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }

  /** @param scope - Exact original existing notice. @returns Minimal fresh source facts after the caller's tribe fence, or genuine absence. */
  private async source(scope: AdmissionNotificationRecipientEmailScope): Promise<SourceRow | null> {
    return (await this.database.execute<SourceRow>(sql`
      select obligation.id,obligation.request_id,obligation.applicant_user_id,obligation.event_type,
        (extract(epoch from obligation.created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_at_microseconds,
        request.status,(extract(epoch from request.submitted_at)*${MICROSECONDS_PER_SECOND})::bigint::text as submitted_at_microseconds,
        (extract(epoch from request.expires_at)*${MICROSECONDS_PER_SECOND})::bigint::text as expires_at_microseconds
      from public.academy_admission_notification_obligations obligation
      join public.academy_admission_requests request on request.id=obligation.request_id and request.tribe_id=obligation.tribe_id and request.user_id=obligation.applicant_user_id
      join public.notifications notice on notice.admission_obligation_id=obligation.id and notice.tribe_id=obligation.tribe_id
      where obligation.id=${scope.obligationId} and obligation.tribe_id=${scope.tribeId} and notice.recipient_user_id=${scope.recipientUserId} and notice.admission_audience=${scope.audience}
    `)).rows[0] ?? null;
  }

  /** @param identity - Current exact owner identity. @returns Its original open bucket, or absence when a previous bucket was closed. */
  private async findOrCreateGroup(identity: AdmissionNotificationGroupIdentity): Promise<string | null> {
    await this.database.execute(sql`insert into public.admission_notification_groups(id,tribe_id,recipient_user_id,audience,mode,preference_version,email_settings_version,time_zone,window_starts_at,window_closes_at,individual_obligation_id)
      values (${randomUUID()},${identity.tribeId},${identity.recipientUserId},${identity.audience},${identity.mode},${identity.preferenceVersion},${identity.emailSettingsVersion},${identity.window.timeZone},${admissionNotificationTimestamp(identity.window.startsAtMicroseconds)},${admissionNotificationTimestamp(identity.window.closesAtMicroseconds)},${identity.individualObligationId})
      on conflict on constraint admission_notification_group_bucket_key do nothing`);
    const group = (await this.database.execute<{ id: string; state: string }>(sql`select id,state from public.admission_notification_groups
      where tribe_id=${identity.tribeId} and recipient_user_id=${identity.recipientUserId} and audience=${identity.audience} and mode=${identity.mode}
        and preference_version=${identity.preferenceVersion} and email_settings_version=${identity.emailSettingsVersion} and time_zone=${identity.window.timeZone}
        and window_starts_at=${admissionNotificationTimestamp(identity.window.startsAtMicroseconds)} and window_closes_at=${admissionNotificationTimestamp(identity.window.closesAtMicroseconds)}
        and individual_obligation_id is not distinct from ${identity.individualObligationId}::uuid for update`)).rows[0];
    return group?.state === ADMISSION_NOTIFICATION_GROUP_STATE.open ? group.id : null;
  }

  /** @param scope - Server-selected original source and recipient. @returns Newly collected or historical lineage, or a current eligibility denial; no result grants external send authority. */
  async collect(scope: AdmissionNotificationRecipientEmailScope): Promise<AdmissionNotificationCollectionResult> {
    return (await this.collectMany(scope.tribeId, [scope]))[0];
  }

  /** @param tribeId - Exact tenant of the server-selected page. @param scopes - At most one bounded page of distinct original notice references, in cursor order. @returns One result per input in its original order; no partial array escapes a storage/runtime failure. @throws AdmissionOperationError for malformed pages or current authority failure before collection. */
  async collectMany(tribeId: string, scopes: readonly AdmissionNotificationRecipientEmailScope[]): Promise<readonly AdmissionNotificationCollectionResult[]> {
    if (scopes.length > ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE || scopes.some((scope) => scope.tribeId !== tribeId) || new Set(scopes.map((scope) => JSON.stringify([scope.obligationId.toLowerCase(), scope.recipientUserId, scope.audience]))).size !== scopes.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    await this.assertAuthorized(tribeId);
    if (!scopes.length) return [];
    if (!(await this.database.execute(sql`select id from public.tribes where id=${tribeId} for update`)).rows[0]) return scopes.map(() => ({ status: ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE }));
    // Pin accounts before historical member locks too: deletion can otherwise hold a user while cascading into an earlier member.
    const recipientIds = [...new Set(scopes.map((scope) => scope.recipientUserId))];
    await this.database.execute(sql`select id from public."user" where id=any(${sql.param(recipientIds)}::text[]) order by id for share`);
    const results = new Map<AdmissionNotificationRecipientEmailScope, AdmissionNotificationCollectionResult>();
    const candidates: AdmissionNotificationRecipientEmailScope[] = [];
    for (const scope of scopes) {
      const source = await this.source(scope);
      if (!source) { await this.assertAuthorized(tribeId); results.set(scope, { status: ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE }); continue; }
      const existing = (await this.database.execute<{ group_id: string; state: AdmissionNotificationGroupMemberState }>(sql`select group_id,state from public.admission_notification_group_members where tribe_id=${tribeId} and obligation_id=${scope.obligationId} and recipient_user_id=${scope.recipientUserId} and audience=${scope.audience} for share`)).rows[0];
      if (existing) { await this.assertAuthorized(tribeId); results.set(scope, { status: ADMISSION_NOTIFICATION_COLLECTION_EXISTING, groupId: existing.group_id, memberState: existing.state }); } else candidates.push(scope);
    }
    if (candidates.length) {
      const config = await this.readSecurityConfig();
      const facts = await new AdmissionNotificationCollectionReader(this.database, this.authorize, this.readSecurityConfig).read(tribeId, candidates);
      for (const scope of candidates) results.set(scope, await this.collectCandidate(scope, config, facts));
    }
    return scopes.map((scope) => { const result = results.get(scope); if (!result) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved); return result; });
  }

  /** @param scope - Exact new source, already classified under the tribe fence. @param config - Original local scope of this same-call batch. @param facts - Locked same-call recipient/settings/resource facts. @returns A fresh per-source eligibility or newly staged member; the caller still owns commit. */
  private async collectCandidate(scope: AdmissionNotificationRecipientEmailScope, config: MessagingSecurityConfig, facts: AdmissionNotificationCollectionFacts): Promise<AdmissionNotificationCollectionResult> {
    const member = facts.memberships.get(scope.recipientUserId), preference = facts.preferences.get(scope.recipientUserId), settings = facts.settings;
    if (!settings) { await this.assertAuthorized(scope.tribeId); return { status: ADMISSION_NOTIFICATION_GROUP_STATUS.suppressed, reason: ADMISSION_NOTIFICATION_GROUP_REASON.emailDisabled }; }
    const calendarNow = Number((await this.database.execute<{ now: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as now`)).rows[0].now);
    const dailyWindow = await createPostgresAdmissionNotificationCalendar(this.database).dailyWindow(calendarNow, settings.time_zone);
    await this.assertAuthorized(scope.tribeId);
    const fresh = await this.source(scope);
    if (!fresh) return { status: ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE };
    const now = Number((await this.database.execute<{ now: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as now`)).rows[0].now);
    const plan = planAdmissionNotificationEmailCandidate({
      source: { id: fresh.id, tribeId: scope.tribeId, admissionRequestId: fresh.request_id, applicantUserId: fresh.applicant_user_id, event: fresh.event_type, createdAtMicroseconds: Number(fresh.created_at_microseconds) },
      request: { id: fresh.request_id, tribeId: scope.tribeId, applicantUserId: fresh.applicant_user_id, status: fresh.status, submittedAtMicroseconds: Number(fresh.submitted_at_microseconds), expiresAtMicroseconds: Number(fresh.expires_at_microseconds) },
      recipient: { userId: scope.recipientUserId, audience: scope.audience, currentRole: member?.role ?? null, membershipStatus: member?.status ?? null, preference: preference ? { tribeId: scope.tribeId, recipientUserId: scope.recipientUserId, mode: preference.mode, version: preference.version, effectiveFromMicroseconds: Number(preference.effective_from_microseconds) } : null },
      emailSettings: { tribeId: scope.tribeId, enabled: settings.enabled, version: settings.version, enabledAtMicroseconds: settings.enabled_at_microseconds === null ? null : Number(settings.enabled_at_microseconds), timeZone: settings.time_zone },
      availability: { tribeId: scope.tribeId, recipientUserId: scope.recipientUserId, trustedAccountEmailAvailable: facts.trustedScopes.has(scope), preparedEmailConnectionAvailable: facts.emailPrepared }, nowMicroseconds: now, dailyWindow,
    });
    if (plan.status !== ADMISSION_NOTIFICATION_GROUP_STATUS.candidate) return plan;
    const groupId = await this.findOrCreateGroup(plan.candidate.identity);
    if (!groupId) return { status: ADMISSION_NOTIFICATION_COLLECTION_BUCKET_CLOSED };
    await this.database.execute(sql`insert into public.admission_notification_group_members(group_id,tribe_id,recipient_user_id,audience,obligation_id) values (${groupId},${scope.tribeId},${scope.recipientUserId},${scope.audience},${scope.obligationId})`);
    await this.assertAuthorized(scope.tribeId);
    const finalConfig = await this.readSecurityConfig();
    if (finalConfig.recoveryLocked || finalConfig.environment !== config.environment || finalConfig.securityEpoch !== config.securityEpoch) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    const finalNow = Number((await this.database.execute<{ now: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as now`)).rows[0].now);
    if (finalNow >= Number(fresh.created_at_microseconds) + ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.challengeExpired);
    return { status: ADMISSION_NOTIFICATION_COLLECTED, groupId };
  }
}
