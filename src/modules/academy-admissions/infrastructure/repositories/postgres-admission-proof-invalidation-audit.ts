/** Records actual proof invalidations inside their existing owner transaction. @module postgres-admission-proof-invalidation-audit */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "../../constants/admission-audit";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_PROOF_STATUS } from "../../constants/admission-eligibility";
import { ADMISSION_PROOF_INVALIDATION_AUDIT_EVENT } from "../../constants/admission-proof";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { createAdmissionResourceAuditEvent } from "../../domain/entities/admission-resource-audit-event";
import { PostgresAdmissionAuditRepository } from "./postgres-admission-audit-repository";

/** Contains only fields returned by the effective invalidation UPDATE. */
export type InvalidatedAdmissionProofAuditRow = {
  id: string; challenge_id: string; verification_epoch: number;
  applied_request_id: string | null; invalidated_at: Date | string;
};
/** Describes consumed proof status from an existing lock without schema-validating database rows. */
type PreviousAdmissionProofState = "available" | "applied" | "invalid";
/** Uses the challenged channel rather than the next issuance channel. */
type AdmissionProofAuditChannel = "email" | "sms" | "whatsapp";
/** Binds the private facts to their authorized action and closed owner-selected reason. */
type AdmissionProofInvalidationAuditScope = { tribeId: string; actorUserId: string; operationId: string; cause: "suspected_compromise" | "connection_disconnected" | "policy_verification_context_changed" | "explicit_resend" }
  | { tribeId: string; actorUserId: null; operationId: null; cause: "security_context_changed" };

/**
 * Selects invalidated proof facts and stages one batch in the owner's existing transaction.
 * @param database - Original protected owner transaction.
 * @param scope - Actual tribe, actor, ledger and owner-selected invalidation reason.
 * @param invalidation - Rows changed by the UPDATE, never all previously observed proofs (`proofs`); original challenge channels from the owner's existing locks (`channels`); and the available predicate, or actual statuses preserved by the existing proof lock (`previousStates`).
 * @returns After staging the selected facts; the owner controls commit and rollback.
 * @throws AdmissionOperationError when a changed proof lacks its original status or channel.
 */
export async function appendAdmissionProofInvalidationAudit(
  database: RequestDatabase,
  scope: AdmissionProofInvalidationAuditScope,
  { proofs, channels, previousStates }: { proofs: readonly InvalidatedAdmissionProofAuditRow[]; channels: ReadonlyMap<string, AdmissionProofAuditChannel>; previousStates: "available" | ReadonlyMap<string, PreviousAdmissionProofState> },
): Promise<void> {
  const events = proofs.map((proof) => {
    const channel = channels.get(proof.challenge_id);
    const fromState = typeof previousStates === "string" ? previousStates : previousStates.get(proof.id);
    if (channel === undefined || (fromState !== ADMISSION_PROOF_STATUS.available && fromState !== ADMISSION_PROOF_STATUS.applied)) {
      throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    }
    return createAdmissionResourceAuditEvent({
      tribeId: scope.tribeId, actorUserId: scope.actorUserId, operationId: scope.operationId,
      resourceType: ADMISSION_AUDIT_RESOURCE_TYPE.proof, resourceId: proof.id,
      eventType: ADMISSION_PROOF_INVALIDATION_AUDIT_EVENT, resourceVersion: null,
      rule: scope.cause, cause: scope.cause, createdAt: new Date(proof.invalidated_at),
      metadata: { fromState, toState: ADMISSION_PROOF_STATUS.invalid, challengeId: proof.challenge_id,
        requestId: proof.applied_request_id, verificationEpoch: proof.verification_epoch, channel },
    });
  });
  await new PostgresAdmissionAuditRepository(database).appendMany(events);
}
