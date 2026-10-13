/** Creates private audit facts independently of commands, metric dimensions and storage. @module admission-audit-event */
import { ADMISSION_POLICY_AUDIT } from "../../constants/admission-policy";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { ADMISSION_PROOF_AUDIT_EVENT, ADMISSION_PROOF_AUDIT_RULE } from "../../constants/admission-proof";
import type {AdmissionResourceAuditEvent} from "./admission-resource-audit-event";

/** Describes the native actor, original ledger and authoritative owner clock. */
type AdmissionAuditScope = { tribeId: string; actorUserId: string; operationId: string; createdAt: Date };
/** Contains only implemented policy command names, never an exception or metric label. */
type AdmissionPolicyAuditOperation = "initialize_admission_policy" | "update_admission_policy" | "activate_admission_policy" | "pause_admission_policy";
/** Allows policy identity, effective version and the owner's bounded internal reason. */
export type AdmissionPolicyAuditInput = AdmissionAuditScope & { resourceId: string; operation: AdmissionPolicyAuditOperation; resourceVersion: number; rule: string | null };
/** Records the exact applied proof and the request version preceding its application. */
export type AdmissionProofAuditInput = AdmissionAuditScope & { requestId: string; proofId: string; previousRequestVersion: number };
/** Keeps private reconstructible resource references separate from public aggregate dimensions. */
type AdmissionOwnerAuditEvent = AdmissionAuditScope & { resourceId: string; rule: string | null; cause: null; resourceVersion: number } & (
  { resourceType: "admission_policy"; eventType: AdmissionPolicyAuditOperation; metadata: Record<string, never> }
  | { resourceType: "admission_request"; eventType: "proof_attached"; metadata: { proofId: string; previousRequestVersion: number } }
);
/** Includes historical owner snapshots and the complete closed private resource vocabulary. */
export type AdmissionAuditEvent=AdmissionOwnerAuditEvent|AdmissionResourceAuditEvent;

/**
 * Selects the owner-derived fields of an effective policy change.
 * @param input - Current actor and committed policy proposal; never a provider row.
 * @returns A fixed audit snapshot without command payloads or arbitrary labels.
 */
export function createAdmissionPolicyAuditEvent(input: AdmissionPolicyAuditInput): AdmissionAuditEvent {
  return {
    tribeId: input.tribeId, actorUserId: input.actorUserId, operationId: input.operationId,
    resourceType: ADMISSION_POLICY_AUDIT.resourceType, resourceId: input.resourceId,
    eventType: input.operation, rule: input.rule, cause: null,
    resourceVersion: input.resourceVersion, metadata: {}, createdAt: new Date(input.createdAt),
  };
}

/**
 * Captures applied local proof provenance without its code or contact.
 * @param input - Original proof/request references and the authoritative application clock.
 * @returns Only actor, operation, applied version and explicit proof references.
 */
export function createAdmissionProofAuditEvent(input: AdmissionProofAuditInput): AdmissionAuditEvent {
  return {
    tribeId: input.tribeId, actorUserId: input.actorUserId, operationId: input.operationId,
    resourceType: ADMISSION_RESOURCE_KIND.request, resourceId: input.requestId,
    eventType: ADMISSION_PROOF_AUDIT_EVENT, rule: ADMISSION_PROOF_AUDIT_RULE, cause: null,
    resourceVersion: input.previousRequestVersion + 1,
    metadata: { proofId: input.proofId, previousRequestVersion: input.previousRequestVersion },
    createdAt: new Date(input.createdAt),
  };
}
