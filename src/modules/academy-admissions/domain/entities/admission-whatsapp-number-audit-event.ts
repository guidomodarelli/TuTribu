/** Captures declared-field version lineage without retaining personal data. @module admission-whatsapp-number-audit-event */
import type { AdmissionRequest } from "./admission-request";
import type { AdmissionPolicy } from "./admission-policy";
import { createAdmissionResourceAuditEvent } from "./admission-resource-audit-event";
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "../../constants/admission-audit";
import { ADMISSION_WHATSAPP_AUDIT_EVENT } from "../../constants/admission-whatsapp-number";

/** @param input - Actual owner, ledger, prior version, current policy and SQL effect clock. @returns A closed audit snapshot with no declared number, name, proof content or notification obligation. */
export function createAdmissionWhatsappNumberAuditEvent(input: {
  actorUserId: string; operationId: string; previous: AdmissionRequest; request: AdmissionRequest;
  policy: Pick<AdmissionPolicy, "version" | "verificationEpoch">; changedAt: Date;
}) {
  const { request } = input;
  return createAdmissionResourceAuditEvent({ tribeId: request.tribeId, actorUserId: input.actorUserId, operationId: input.operationId,
    resourceType: ADMISSION_AUDIT_RESOURCE_TYPE.request, resourceId: request.id, resourceVersion: request.version,
    eventType: ADMISSION_WHATSAPP_AUDIT_EVENT, rule: null, cause: null, createdAt: input.changedAt,
    metadata: { fromStatus: input.previous.status, toStatus: request.status, previousVersion: input.previous.version,
      policyVersion: input.policy.version, verificationEpoch: input.policy.verificationEpoch,
      proofId: request.proofId, decisionId: request.decisionId, invitationId: request.invitationId } });
}
