/** Projects private leader metadata without cryptographic material or authority from token possession. @module personal-invitation-result */
import type { PersonalInvitation } from "../../domain/entities/personal-invitation";
import { personalInvitationSchema } from "./admission-public-result-schemas";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { admissionOperationFailure } from "./admission-operation-failure";

/** @param invitation - Current authorized inward entity. @returns The actual own DTO contract; legacy unusable names close instead of fabricating metadata or a token. */
export function presentPersonalInvitation(invitation: PersonalInvitation) {
  return personalInvitationSchema.parse({ id: invitation.id, version: invitation.version, internalName: invitation.internalName, recipient: { type: invitation.contact.type, value: invitation.contact.value, ...(invitation.contact.type === "phone" ? { country: invitation.contact.country } : {}) }, requiresAllowlist: invitation.requiresAllowlist, expiresAt: invitation.expiresAt?.toISOString() ?? null, status: invitation.status });
}

/** @param error - Actual own writer/resolver failure with private diagnostic cause. @param operationId - Exact requested original command. @returns A closed failure when reported progress belongs to another operation, preserving the cause privately. */
export function personalInvitationOperationFailure(error: unknown, operationId: string) {
  return admissionOperationFailure(error instanceof AdmissionOperationError && error.operationId && error.operationId.toLowerCase() !== operationId.toLowerCase()
    ? new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { cause: error })
    : error);
}
