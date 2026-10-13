/** Resolves current private reviewer facts without reviving revoked captures or depending on message transport. @module postgres-admission-review-evidence */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionRequest } from "../../domain/entities/admission-request";
import { mapAdmissionReviewStorage, type AdmissionReviewStorageRecord } from "./admission-review-storage-mapper";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_EVIDENCE_KIND } from "../../constants/admission-eligibility";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";

/** @param database - Locked original reviewer transaction. @param scope - Actual current reviewer and tenant. @param request - Exact original pending row/version. @param security - Current host recovery/environment/epoch. @returns Current inward review facts; SQL rows are mapped without schema validation or raw projection. */
export async function readAdmissionReviewEvidence(database: RequestDatabase, scope: AdmissionCommandScope, request: AdmissionRequest, security: MessagingSecurityConfig) {
  if (request.evidence.kind === ADMISSION_EVIDENCE_KIND.base) {
    // Match the auth owner's user -> account -> capture order. The projection
    // below runs after every wait and cannot revive a superseded original.
    await database.execute(sql`select id from public."user" where id=${request.userId} for share`);
    const original = (await database.execute<{ account_id: string }>(sql`select account_id from public.global_identity_evidence where id=${request.evidence.identityEvidenceId} and user_id=${request.userId}`)).rows[0];
    if (original) {
      await database.execute(sql`select id from public.account where id=${original.account_id} and "userId"=${request.userId} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} for share`);
      await database.execute(sql`select id from public.global_identity_evidence where id=${request.evidence.identityEvidenceId} and user_id=${request.userId} for share`);
    }
  }
  const row = (await database.execute<{ record: AdmissionReviewStorageRecord }>(sql`select record from public.read_admission_reviews(${scope.tribeId},${scope.sessionId},${request.id},1)`)).rows[0];
  if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
  const projected = mapAdmissionReviewStorage(row.record, now, security.recoveryLocked);
  if (projected.request.id !== request.id || projected.request.userId !== request.userId || projected.request.tribeId !== request.tribeId || projected.request.version !== request.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
  const proof = projected.review.request.attachedEvidence;
  if (request.evidence.kind === ADMISSION_EVIDENCE_KIND.local) {
    if (!proof || proof.id !== request.evidence.proofId || proof.securityEpoch !== security.securityEpoch) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
    const resource = (await database.execute<{ environment: string; security_epoch: string }>(sql`select environment,security_epoch from public.messaging_connection_versions where connection_id=${proof.connectionId} and tribe_id=${scope.tribeId} and version=${proof.connectionVersion} for share`)).rows[0];
    if (!resource || resource.environment !== security.environment || resource.security_epoch !== security.securityEpoch) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
  }
  return projected.review;
}
