/** Reads private current destination evidence without sessions, provider calls or public DTO projection. @module postgres-admission-notification-recipient-email-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "../../constants/admission-notifications";
import type { AdmissionNotificationGlobalEmailEvidence, AdmissionNotificationLocalEmailProof, AdmissionNotificationRecipientEmailFacts, AdmissionNotificationRecipientEmailScope, TrustedAdmissionNotificationEmail } from "../../domain/entities/admission-notification-recipient-email";
import type { AdmissionNotificationRecipientEmailReader } from "../../domain/repositories/admission-notification-recipient-email-reader";
import { resolveAdmissionNotificationRecipientEmail } from "../../domain/policies/admission-notification-recipient-email";

/** Contains only the private original notice/request fields consumed by the email policy. */
type SourceRow = AdmissionNotificationRecipientEmailFacts["source"];
/** Reads live local runtime metadata; the composition must not perform a provider RPC here. */
type RuntimeReader = () => Promise<AdmissionNotificationRecipientEmailFacts["runtime"]>;
/** Batches only existing notice references sharing one native tenant, recipient and audience. */
type AdmissionNotificationRecipientEmailBatchScope = Omit<AdmissionNotificationRecipientEmailScope, "obligationId"> & { readonly obligationIds: readonly string[] };

/** Preserves auth's user/account/capture order and rechecks the exact original notice after source locks. */
export class PostgresAdmissionNotificationRecipientEmailReader implements AdmissionNotificationRecipientEmailReader {
  /** @param database - Existing authorized producer/dispatcher transaction; commit remains with that owner. @param readRuntime - Current server-owned environment/security epoch, not browser flags. */
  constructor(private readonly database: RequestDatabase, private readonly readRuntime: RuntimeReader) {}

  /**
   * Resolves the current destination independently of frequency, provider readiness or send authority.
   * @param scope - Existing server-selected original notice, tenant, audience and recipient.
   * @returns Only trusted current account email or genuine absence; native storage/runtime failures propagate.
   */
  async read(scope: AdmissionNotificationRecipientEmailScope): Promise<TrustedAdmissionNotificationEmail | null> {
    const destinations = await this.readBatch({ tribeId: scope.tribeId, recipientUserId: scope.recipientUserId, audience: scope.audience, obligationIds: [scope.obligationId] });
    return destinations.get(scope.obligationId) ?? null;
  }

  /**
   * Pins shared account/capture/role facts once and resolves every original notice independently.
   * @param scope - Server-selected native source ids for exactly one tenant, recipient and audience.
   * @returns Only individually trusted destinations keyed by their original native obligation ids; missing or denied sources remain absent.
   * @throws Native storage/runtime failures without returning a partial successful batch or caching facts across transactions.
   */
  async readBatch(scope: AdmissionNotificationRecipientEmailBatchScope): Promise<ReadonlyMap<string, TrustedAdmissionNotificationEmail>> {
    const destinations = new Map<string, TrustedAdmissionNotificationEmail>();
    if (!scope.obligationIds.length || !(await this.database.execute(sql`select id from public.tribes where id=${scope.tribeId} for share`)).rows[0]) return destinations;
    const locators = await this.findSources(scope);
    if (!locators.length) return destinations;
    const account = (await this.database.execute<{ userId: string; normalizedEmail: string }>(sql`select id as "userId",lower(btrim(email)) as "normalizedEmail" from public."user" where id=${scope.recipientUserId} for share`)).rows[0];
    if (!account) return destinations;
    const accountIds = (await this.database.execute<{ id: string }>(sql`select id from public.account where "userId"=${scope.recipientUserId} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} order by id for share`)).rows.map((linked) => linked.id);
    if (accountIds.length) await this.database.execute(sql`select id from public.global_identity_evidence where user_id=${scope.recipientUserId} and account_id in (${sql.join(accountIds.map((accountId) => sql`${accountId}`), sql`,`)}) and invalidated_at is null order by account_id,id for share`);
    await this.database.execute(sql`select id from public.tribe_members where tribe_id=${scope.tribeId} and user_id=${scope.recipientUserId} for share`);
    const requestIds = [...new Set(locators.map((source) => source.admissionRequestId))], obligationIds = locators.map((source) => source.obligationId);
    await this.database.execute(sql`select id from public.academy_admission_requests where id=any(${sql.param(requestIds)}::uuid[]) and tribe_id=${scope.tribeId} order by id for share`);
    await this.database.execute(sql`select id from public.academy_admission_notification_obligations where id=any(${sql.param(obligationIds)}::uuid[]) and tribe_id=${scope.tribeId} order by id for share`);
    await this.database.execute(sql`select id from public.notifications where admission_obligation_id=any(${sql.param(obligationIds)}::uuid[]) and tribe_id=${scope.tribeId} and recipient_user_id=${scope.recipientUserId} and admission_audience=${scope.audience} order by id for share`);
    const originalRequests = new Map(locators.map((source) => [source.obligationId, source.admissionRequestId]));
    const requestedIds = new Set(scope.obligationIds);
    const sources = (await this.findSources(scope)).filter((source) => requestedIds.has(source.obligationId) && originalRequests.get(source.obligationId) === source.admissionRequestId);
    if (scope.audience === ADMISSION_NOTIFICATION_AUDIENCE.applicant) for (const source of sources) await this.lockLocalProof({ ...scope, obligationId: source.obligationId }, source);
    const runtime = await this.readRuntime();
    const globalEvidence = await this.readGlobalEvidence(scope.recipientUserId, accountIds);
    const membership = (await this.database.execute<{ currentRole: string; membershipStatus: string }>(sql`select role as "currentRole",status as "membershipStatus" from public.tribe_members where tribe_id=${scope.tribeId} and user_id=${scope.recipientUserId}`)).rows[0];
    for (const source of sources) {
      const originalScope: AdmissionNotificationRecipientEmailScope = { tribeId: scope.tribeId, recipientUserId: scope.recipientUserId, audience: scope.audience, obligationId: source.obligationId };
      const localProof = scope.audience === ADMISSION_NOTIFICATION_AUDIENCE.applicant ? await this.readLocalProof(originalScope, source) : null;
      const destination = resolveAdmissionNotificationRecipientEmail({ scope: originalScope, source, account: { ...account, currentRole: membership?.currentRole ?? null, membershipStatus: membership?.membershipStatus ?? null }, globalEvidence, localProof, runtime });
      if (destination) destinations.set(source.obligationId, destination);
    }
    return destinations;
  }

  /** @param scope - Exact existing own notice coordinates sharing recipient and audience. @returns Selected own source fields, without schema-revalidating database rows or accepting an unrelated source. */
  private async findSources(scope: AdmissionNotificationRecipientEmailBatchScope): Promise<SourceRow[]> {
    return (await this.database.execute<SourceRow>(sql`
      select obligation.tribe_id as "tribeId",obligation.id as "obligationId",request.id as "admissionRequestId",
        request.user_id as "applicantUserId",obligation.event_type as event,notice.recipient_user_id as "noticeRecipientUserId",
        notice.admission_audience as "noticeAudience",request.evidence_source as "evidenceKind",request.proof_id as "proofId",
        request.contact_type as "contactType",request.normalized_contact as "normalizedContact"
      from public.notifications notice
      inner join public.academy_admission_notification_obligations obligation on obligation.id=notice.admission_obligation_id and obligation.tribe_id=notice.tribe_id
      inner join public.academy_admission_requests request on request.id=obligation.request_id and request.tribe_id=obligation.tribe_id and request.user_id=obligation.applicant_user_id
      where notice.tribe_id=${scope.tribeId} and notice.admission_obligation_id=any(${sql.param(scope.obligationIds)}::uuid[])
        and notice.recipient_user_id=${scope.recipientUserId} and notice.admission_audience=${scope.audience}
      order by request.id,obligation.id
    `)).rows;
  }

  /** @param scope - Exact recipient and original tribe. @param source - Rechecked source under request/obligation/notice locks. @returns After pinning its own applied-proof lineage and immutable source version, without needing a live credential. */
  private async lockLocalProof(scope: AdmissionNotificationRecipientEmailScope, source: SourceRow): Promise<void> {
    if (scope.audience !== ADMISSION_NOTIFICATION_AUDIENCE.applicant || !source.proofId) return;
    const proof = (await this.database.execute<{ connectionId: string; connectionVersion: number }>(sql`
      select connection_id as "connectionId",connection_version as "connectionVersion" from public.academy_admission_verification_proofs
      where id=${source.proofId} and tribe_id=${scope.tribeId} and user_id=${scope.recipientUserId} and applied_request_id=${source.admissionRequestId} for share
    `)).rows[0];
    if (proof) await this.database.execute(sql`select connection_id from public.messaging_connection_versions where connection_id=${proof.connectionId} and tribe_id=${scope.tribeId} and version=${proof.connectionVersion} for share`);
  }

  /** @param recipientUserId - Current native recipient. @param accountIds - Only linked accounts actually locked in this transaction, excluding phantoms added during another wait. @returns Current minimal captures after all locks, without imposing OAuth token expiry on durable identity. */
  private async readGlobalEvidence(recipientUserId: string, accountIds: readonly string[]): Promise<AdmissionNotificationGlobalEmailEvidence[]> {
    if (!accountIds.length) return [];
    return (await this.database.execute<AdmissionNotificationGlobalEmailEvidence>(sql`
      select evidence.user_id as "userId",linked."userId" as "accountUserId",linked.id as "accountId",evidence.account_id as "evidenceAccountId",
        linked."providerId" as "providerId",linked."accountId" as "accountSubject",evidence.provider_subject as "evidenceSubject",
        evidence.normalized_email as "normalizedEmail",evidence.classification,
        evidence.invalidated_at is not null as invalidated,evidence.verified_at<=clock_timestamp() as "verifiedInPast"
      from public.account linked inner join public.global_identity_evidence evidence
        on evidence.account_id=linked.id and evidence.user_id=linked."userId" and evidence.provider_id=linked."providerId" and evidence.provider_subject=linked."accountId"
      where linked."userId"=${recipientUserId} and linked."providerId"=${GOOGLE_IDENTITY_PROVIDER}
        and linked.id in (${sql.join(accountIds.map((accountId) => sql`${accountId}`), sql`,`)}) and evidence.invalidated_at is null
      order by linked.id,evidence.id
    `)).rows;
  }

  /** @param scope - Original exact applicant notice. @param source - Current scoped request and its proof reference. @returns Only applied local provenance with native clock predicates; presentation freshness and provider readiness remain separate. */
  private async readLocalProof(scope: AdmissionNotificationRecipientEmailScope, source: SourceRow): Promise<AdmissionNotificationLocalEmailProof | null> {
    if (scope.audience !== ADMISSION_NOTIFICATION_AUDIENCE.applicant || !source.proofId) return null;
    return (await this.database.execute<AdmissionNotificationLocalEmailProof>(sql`
      select proof.id,proof.user_id as "userId",proof.tribe_id as "tribeId",proof.applied_request_id as "appliedRequestId",
        proof.contact_type as "contactType",proof.normalized_contact as "normalizedContact",challenge.purpose,proof.status,
        proof.invalidated_at is not null as invalidated,proof.verified_at<=clock_timestamp() as "verifiedInPast",proof.applied_at<=clock_timestamp() as "appliedInPast",
        resource.environment,proof.security_epoch as "securityEpoch",resource.security_epoch as "resourceSecurityEpoch"
      from public.academy_admission_verification_proofs proof
      inner join public.contact_verification_challenges challenge on challenge.id=proof.challenge_id and challenge.tribe_id=proof.tribe_id and challenge.user_id=proof.user_id
        and challenge.contact_type=proof.contact_type and challenge.normalized_contact=proof.normalized_contact
      inner join public.messaging_connection_versions resource on resource.connection_id=proof.connection_id and resource.tribe_id=proof.tribe_id and resource.version=proof.connection_version
      where proof.id=${source.proofId} and proof.tribe_id=${scope.tribeId} and proof.user_id=${scope.recipientUserId} and proof.applied_request_id=${source.admissionRequestId}
    `)).rows[0] ?? null;
  }
}
