/** Names recoverable business rejections without completing authorization or technical failures. @module admission-command-denial-constants */
import { ADMISSION_ERROR_CODE } from "./admission-errors";

/** Exact completed business codes; auth, transport and unusable contracts remain outside this outcome. */
export type AdmissionCommandDenialCode = "invalid_input" | "resource_unavailable" | "invitation_unavailable"
  | "policy_conflict" | "request_conflict" | "contact_evidence_required" | "additional_verification_required"
  | "contact_binding_conflict" | "proof_unavailable" | "admissions_paused" | "admission_ineligible" | "membership_recovery_required";
/** A denial records no membership, evidence, contact or recipient identity. */
export type AdmissionCommandDenial = { outcome: "denied"; code: AdmissionCommandDenialCode; admissionRequestId: string | null };
/** Only current guarded business failures can become original terminal results. */
export const ADMISSION_COMMAND_DENIAL_CODES = [ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.resourceUnavailable,
  ADMISSION_ERROR_CODE.invitationUnavailable, ADMISSION_ERROR_CODE.policyConflict, ADMISSION_ERROR_CODE.requestConflict,
  ADMISSION_ERROR_CODE.contactEvidenceRequired, ADMISSION_ERROR_CODE.additionalVerificationRequired,
  ADMISSION_ERROR_CODE.contactBindingConflict, ADMISSION_ERROR_CODE.proofUnavailable, ADMISSION_ERROR_CODE.admissionsPaused,
  ADMISSION_ERROR_CODE.admissionIneligible, ADMISSION_ERROR_CODE.membershipRecoveryRequired] as const satisfies readonly AdmissionCommandDenialCode[];
/** Rolls back every staged request/access/audit effect while keeping the enclosing original registry. */
export const ADMISSION_COMMAND_EFFECT_SQL = { begin: "savepoint admission_command_effect", rollback: "rollback to savepoint admission_command_effect", release: "release savepoint admission_command_effect" } as const;
