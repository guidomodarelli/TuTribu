/** Reads the current account's request without membership, claims or lifecycle writes. @module postgres-own-admission-request-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionCommandScope } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionOwnRequestReader } from "@/src/modules/academy-admissions/domain/repositories/admission-query-reader";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_EVIDENCE_KIND, ADMISSION_PROOF_STATUS, ADMISSION_DENIAL_REASON } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_CONTACT_MASK, ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH } from "@/src/modules/academy-admissions/constants/admission-contact-presentation";
import { getAdmissionRetryAllowedAt } from "@/src/modules/academy-admissions/domain/entities/admission-request";

/** The trusted root binds this executor to the actual current account/session. */
type OwnQueryExecutor = <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Only consumed own storage fields are selected; no schema is applied to a PostgreSQL response. */
type OwnRequestRow = {
  id: string; status: AdmissionRequestDto["status"]; version: number; submitted_at: string; expires_at: string;
  source: AdmissionRequestDto["source"]; contact_type: "email" | "phone" | null; normalized_contact: string | null;
  evidence_source: "none" | "declared" | "base" | "local"; external_message: string | null; decided_at: string | null;
  retry_allowed_at: string | null; requires_additional_verification: boolean | null; verification_epoch: number | null;
  proof_status: string | null; proof_verification_epoch: number | null; applied_request_id: string | null;
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
export class PostgresOwnAdmissionRequestReader implements AdmissionOwnRequestReader<AdmissionRequestDto> {
  /** @param execute - Current actor executor; this reader has no writer, keyring, SDK or defaults. */
  constructor(private readonly execute: OwnQueryExecutor) {}

  /** Rechecks native SQL actor and current session without requiring a membership or acquiring write authority. */
  private async authorize(database: RequestDatabase, scope: AdmissionCommandScope): Promise<Date> {
    const session = (await database.execute<{ now: string }>(sql`select clock_timestamp() as now from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "userId"=public.current_app_user_id() and "expiresAt">clock_timestamp()`)).rows[0];
    if (!session) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return new Date(session.now);
  }

  /**
   * Reads the latest own presentation, keeping original status/version/deadline and separate current expiry reasons.
   * @param scope - Server-derived actual account/session/tribe and correlation.
   * @returns An own DTO or null, without claiming an operation, initializing a policy or materializing expiration.
   */
  async readOwn(scope: AdmissionCommandScope & { admissionRequestId?: string }): Promise<AdmissionRequestDto | null> {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const row = (await database.execute<OwnRequestRow>(scope.admissionRequestId
        ? sql`select * from public.read_own_admission_request_summary(${scope.tribeId},${scope.sessionId},${scope.admissionRequestId})`
        : sql`select * from public.read_own_admission_request_summary(${scope.tribeId},${scope.sessionId})`)).rows[0];
      const now = await this.authorize(database, scope);
      if (!row) return null;
      const pending = row.status === ADMISSION_REQUEST_STATUS.pending;
      const expired = pending && now >= new Date(row.expires_at);
      const needsVerification = pending && !expired && row.requires_additional_verification === true
        && (row.evidence_source !== ADMISSION_EVIDENCE_KIND.local || row.proof_status !== ADMISSION_PROOF_STATUS.applied || row.applied_request_id !== row.id || row.proof_verification_epoch !== row.verification_epoch);
      const mayRetry = row.status === ADMISSION_REQUEST_STATUS.cancelled || row.status === ADMISSION_REQUEST_STATUS.expired || row.status === ADMISSION_REQUEST_STATUS.rejected;
      const retryAt = mayRetry ? getAdmissionRetryAllowedAt({ status: row.status, submittedAt: new Date(row.submitted_at), resolvedAt: row.decided_at ? new Date(row.decided_at) : null, retryAllowedAt: row.retry_allowed_at ? new Date(row.retry_allowed_at) : null }) : null;
      const contact = maskedContact(row);
      return {
        id: row.id, status: row.status, version: row.version, submittedAt: new Date(row.submitted_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(), source: row.source,
        ...(contact ? { contact } : {}), needsVerification,
        eligibilityReasons: expired ? [ADMISSION_DENIAL_REASON.requestExpired] : needsVerification ? [ADMISSION_DENIAL_REASON.proofRequired] : [],
        ...(row.external_message ? { externalMessage: row.external_message } : {}), ...(retryAt ? { retryAllowedAt: retryAt.toISOString() } : {}),
      };
    });
  }
}
