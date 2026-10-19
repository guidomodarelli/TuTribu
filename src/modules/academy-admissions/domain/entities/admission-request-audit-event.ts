/** Captures effective request decisions and dedicated corrective retry provenance without applicant content. @module admission-request-audit-event */
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "../../constants/admission-audit";
import { ADMISSION_RETRY_AUDIT } from "../../constants/admission-decision";
import type { AdmissionRequest } from "./admission-request";
import type { AdmissionDecision } from "./admission-decision";
import { createAdmissionResourceAuditEvent, type AdmissionRequestAuditEventType } from "./admission-resource-audit-event";

/** Uses the actual decision's effective policy and clock rather than assuming the original presentation policy remains current. */
export type AdmissionRequestAuditDecision = Pick<AdmissionDecision,"id"|"rule"|"policyVersion"|"verificationEpoch"|"decidedAt">;
/** Retains only the prior locked lifecycle and original actor/ledger. */
export type AdmissionRequestAuditInput = { actorUserId:string;operationId:string;eventType:AdmissionRequestAuditEventType;request:AdmissionRequest;previous:Pick<AdmissionRequest,"status"|"version">|null;decision:AdmissionRequestAuditDecision|null };

/**
 * Selects the current owner proposal and decision provenance without copying contact or human messages.
 * @param input - Original command scope, current request, locked prior state and effective decision or initial absence.
 * @returns A detached audit fact with the presentation or actual decision clock.
 */
export function createAdmissionRequestAuditEvent(input:AdmissionRequestAuditInput){
  const {request,previous,decision}=input;
  return createAdmissionResourceAuditEvent({
    tribeId:request.tribeId,actorUserId:input.actorUserId,operationId:input.operationId,
    resourceType:ADMISSION_AUDIT_RESOURCE_TYPE.request,resourceId:request.id,resourceVersion:request.version,
    eventType:input.eventType,rule:decision?.rule??null,cause:null,createdAt:decision?.decidedAt??request.submittedAt,
    metadata:{fromStatus:previous?.status??null,toStatus:request.status,previousVersion:previous?.version??null,policyVersion:decision?.policyVersion??request.originalPolicy.version,verificationEpoch:decision?.verificationEpoch??request.originalPolicy.verificationEpoch,proofId:request.proofId,decisionId:request.decisionId,invitationId:request.invitationId},
  });
}

/**
 * Preserves the private corrective reason and retry date without inventing another terminal decision.
 * @param input - Authorized owner proposal and the original terminal request after current CAS checks.
 * @returns A dedicated private retry fact, retaining original presentation policy and decision lineage.
 */
export function createAdmissionRetryAuditEvent(input:{actorUserId:string;operationId:string;request:AdmissionRequest;previous:AdmissionRequest;internalReason:string;retryAllowedAt:Date}){
  const {request,previous}=input;
  return createAdmissionResourceAuditEvent({
    tribeId:request.tribeId,actorUserId:input.actorUserId,operationId:input.operationId,
    resourceType:ADMISSION_AUDIT_RESOURCE_TYPE.request,resourceId:request.id,resourceVersion:request.version,
    eventType:ADMISSION_RETRY_AUDIT.event,rule:ADMISSION_RETRY_AUDIT.rule,cause:null,createdAt:input.retryAllowedAt,
    metadata:{fromStatus:previous.status,toStatus:request.status,previousVersion:previous.version,policyVersion:request.originalPolicy.version,verificationEpoch:request.originalPolicy.verificationEpoch,proofId:request.proofId,decisionId:request.decisionId,invitationId:request.invitationId,internalReason:input.internalReason,previousRetryAllowedAt:previous.retryAllowedAt?.toISOString()??null,retryAllowedAt:input.retryAllowedAt.toISOString()},
  });
}
