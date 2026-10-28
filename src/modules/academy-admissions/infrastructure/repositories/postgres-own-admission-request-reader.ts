/** Reads the current account's request without membership, claims or lifecycle writes. @module postgres-own-admission-request-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionCommandScope } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionOwnRequestReader } from "@/src/modules/academy-admissions/domain/repositories/admission-query-reader";
import type { AdmissionRequestDto, AdmissionOwnRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_DENIAL_REASON } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_CONTACT_MASK, ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH } from "@/src/modules/academy-admissions/constants/admission-contact-presentation";
import { getAdmissionRetryAllowedAt } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { evaluatePendingAdmissionEligibility, needsPendingAdmissionVerification } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { mapAdmissionReviewStorage, type AdmissionReviewStorageRecord } from "./admission-review-storage-mapper";
import { readMessagingRecoveryLock } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

/** The trusted root binds this executor to the actual current account/session. */
type OwnQueryExecutor = <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Only consumed own storage fields are selected; no schema is applied to a PostgreSQL response. */
type OwnRequestRow = {
  id: string; status: AdmissionRequestDto["status"]; version: number; submitted_at: string; expires_at: string;
  source: AdmissionRequestDto["source"]; contact_type: "email" | "phone" | null; normalized_contact: string | null;
  evidence_source: "none" | "declared" | "base" | "local"; external_message: string | null; decided_at: string | null;
  retry_allowed_at: string | null;
};

/** Masks an owned canonical contact; the raw value never becomes a client property. */
function maskedContact(row: OwnRequestRow): AdmissionRequestDto["contact"] {
  if (!row.contact_type || !row.normalized_contact) return undefined;
  const maskedValue = row.contact_type === ADMISSION_CONTACT_TYPE.phone
    ? `${ADMISSION_CONTACT_MASK}${row.normalized_contact.slice(-ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH)}`
    : `${Array.from(row.normalized_contact)[0] ?? ""}${ADMISSION_CONTACT_MASK}@${row.normalized_contact.split("@").at(-1) ?? ""}`;
  return { type: row.contact_type, maskedValue, evidenceKind: row.evidence_source };
}

/** The public DTO is validated by application/boundary; this adapter never returns reviewer notes or identity ids. */
export class PostgresOwnAdmissionRequestReader implements AdmissionOwnRequestReader<AdmissionOwnRequestDto> {
  /** @param execute - Current actor executor. @param readRecoveryLock - Live non-secret hosting closure, without keyring or provider access. */
  constructor(private readonly execute: OwnQueryExecutor, private readonly readRecoveryLock: () => Promise<boolean> = async () => readMessagingRecoveryLock()) {}

  /** Rechecks native SQL actor and current session without requiring a membership or acquiring write authority. */
  private async authorize(database: RequestDatabase, scope: AdmissionCommandScope): Promise<Date> {
    const session = (await database.execute<{ now: string }>(sql`select clock_timestamp() as now from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "userId"=public.current_app_user_id() and "expiresAt">clock_timestamp()`)).rows[0];
    if (!session) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return new Date(session.now);
  }

  /**
   * Re-evaluates a live pending presentation against current private facts.
   * @param database - Same read transaction. @param scope - Native applicant. @param row - Own live pending summary.
   * @returns The resampled clock, current eligibility reasons, whether a proof is needed and the declared WhatsApp view.
   * @throws AdmissionOperationError when the facts are unavailable or no longer match the summary.
   */
  private async readPendingEligibility(database: RequestDatabase, scope: AdmissionCommandScope, row: OwnRequestRow) {
    const current = (await database.execute<{ record: AdmissionReviewStorageRecord }>(sql`select record from public.read_own_admission_request_eligibility(${scope.tribeId},${scope.sessionId},${row.id})`)).rows[0];
    const recoveryLocked = await this.readRecoveryLock();
    const now = await this.authorize(database, scope);
    if (!current) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const facts = mapAdmissionReviewStorage(current.record, now, recoveryLocked);
    if (facts.request.id !== row.id || facts.request.userId !== scope.userId || facts.request.tribeId !== scope.tribeId || facts.request.version !== row.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    const declaredWhatsapp: Pick<AdmissionOwnRequestDto, "whatsappNumber" | "requiresWhatsappNumber"> = { whatsappNumber: facts.request.whatsappNumber ?? null, requiresWhatsappNumber: facts.review.policy?.requiresWhatsappNumber ?? false };
    const evaluation = evaluatePendingAdmissionEligibility(facts.review);
    const eligibilityReasons: AdmissionRequestDto["eligibilityReasons"] = evaluation.eligible ? [] : [evaluation.reason];
    return { now, eligibilityReasons, needsVerification: needsPendingAdmissionVerification(facts.review), declaredWhatsapp };
  }

  /**
   * Reads the latest own presentation, keeping original status/version/deadline and separate current expiry reasons.
   * @param scope - Server-derived actual account/session/tribe and correlation.
   * @returns An own DTO or null, without claiming an operation, initializing a policy or materializing expiration.
   */
  async readOwn(scope: AdmissionCommandScope & { admissionRequestId?: string }): Promise<AdmissionOwnRequestDto | null> {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const row = (await database.execute<OwnRequestRow>(scope.admissionRequestId
        ? sql`select * from public.read_own_admission_request_summary(${scope.tribeId},${scope.sessionId},${scope.admissionRequestId})`
        : sql`select * from public.read_own_admission_request_summary(${scope.tribeId},${scope.sessionId})`)).rows[0];
      let now = await this.authorize(database, scope);
      if (!row) return null;
      const pending = row.status === ADMISSION_REQUEST_STATUS.pending;
      let eligibilityReasons: AdmissionRequestDto["eligibilityReasons"] = [];
      let needsVerification = false;
      let declaredWhatsapp: Pick<AdmissionOwnRequestDto, "whatsappNumber" | "requiresWhatsappNumber"> = {};
      if (pending && now < new Date(row.expires_at)) ({ now, eligibilityReasons, needsVerification, declaredWhatsapp } = await this.readPendingEligibility(database, scope, row));
      const expired = pending && now >= new Date(row.expires_at);
      eligibilityReasons = presentedReasons(eligibilityReasons, expired, needsVerification);
      const retryAt = ownRetryAt(row);
      const contact = maskedContact(row);
      return {
        id: row.id, status: row.status, version: row.version, submittedAt: new Date(row.submitted_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(), source: row.source,
        ...(contact ? { contact } : {}), needsVerification,
        eligibilityReasons, ...declaredWhatsapp,
        ...(row.external_message ? { externalMessage: row.external_message } : {}), ...(retryAt ? { retryAllowedAt: retryAt.toISOString() } : {}),
      };
    });
  }
}

/** @param reasons - Current eligibility reasons. @param expired - Whether the pending deadline passed. @param needsVerification - Whether a proof is still needed. @returns Only the expiry reason once expired, else the reasons plus the needed proof reason. */
function presentedReasons(reasons: AdmissionRequestDto["eligibilityReasons"], expired: boolean, needsVerification: boolean): AdmissionRequestDto["eligibilityReasons"] {
  if (expired) return [ADMISSION_DENIAL_REASON.requestExpired];
  if (!needsVerification) return reasons;
  const proofReason = reasons.includes(ADMISSION_DENIAL_REASON.evidenceRevoked) ? ADMISSION_DENIAL_REASON.evidenceRevoked : ADMISSION_DENIAL_REASON.proofRequired;
  if (!reasons.includes(proofReason)) reasons.push(proofReason);
  return reasons;
}

/** @param row - Own summary. @returns When a closed presentation may be retried, or `null` while it cannot. */
function ownRetryAt(row: OwnRequestRow): Date | null {
  const mayRetry = row.status === ADMISSION_REQUEST_STATUS.cancelled || row.status === ADMISSION_REQUEST_STATUS.expired || row.status === ADMISSION_REQUEST_STATUS.rejected;
  return mayRetry ? getAdmissionRetryAllowedAt({ status: row.status, submittedAt: new Date(row.submitted_at), resolvedAt: row.decided_at ? new Date(row.decided_at) : null, retryAllowedAt: row.retry_allowed_at ? new Date(row.retry_allowed_at) : null }) : null;
}
