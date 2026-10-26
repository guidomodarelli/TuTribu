/** Projects effective invitation lifecycle and authorization lineage without its private contact or token. @module personal-invitation-audit-event */
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "../../constants/admission-audit";
import type { PersonalInvitation } from "./personal-invitation";
import { createAdmissionResourceAuditEvent, type PersonalInvitationAuditEventType } from "./admission-resource-audit-event";

/** Selects only owner facts from the locked prior resource and committed proposal. */
export type PersonalInvitationAuditInput = {
  actorUserId: string; operationId: string; eventType: PersonalInvitationAuditEventType;
  invitation: PersonalInvitation;
  previous: Pick<PersonalInvitation, "status" | "version" | "authorizationRevokedAt"> | null;
};

/**
 * Records both single-use status and independent authorization withdrawal using the actual effect clock.
 * @param input - Native actor/ledger, server-selected event and effective owner proposal after locks.
 * @returns A private event without descriptive names, contact, token material or command payload.
 */
export function createPersonalInvitationAuditEvent(input: PersonalInvitationAuditInput) {
  const { invitation, previous } = input;
  return createAdmissionResourceAuditEvent({
    tribeId: invitation.tribeId, actorUserId: input.actorUserId, operationId: input.operationId,
    resourceType: ADMISSION_AUDIT_RESOURCE_TYPE.personalInvitation, resourceId: invitation.id,
    eventType: input.eventType, resourceVersion: invitation.version, rule: null, cause: null,
    metadata: { fromStatus: previous?.status ?? null, toStatus: invitation.status, previousVersion: previous?.version ?? null, requestId: invitation.redeemedRequestId, fromAuthorizationRevoked: previous === null ? null : previous.authorizationRevokedAt !== null, toAuthorizationRevoked: invitation.authorizationRevokedAt !== null },
    createdAt: invitation.updatedAt,
  });
}
