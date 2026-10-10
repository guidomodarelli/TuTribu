/** Proposes a versioned personal invitation lifecycle without token recovery, contact binding or membership effects. @module personal-invitation */
import type { AdmissionContact, AdmissionContactType } from "../value-objects/admission-contact";
import { normalizeAdmissionContact } from "../value-objects/admission-contact";
import { AdmissionOperationError } from "../errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_INVITATION_STATUS } from "../../constants/admission-eligibility";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS, ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { normalizePersonalInvitationName } from "../value-objects/personal-invitation-name";

/** Immutable recipient/restrictions and explicit single-use lineage remain separate from editable descriptive metadata. */
export type PersonalInvitation = {
  id: string; tribeId: string; createdByUserId: string | null; internalName: string | null;
  contact: AdmissionContact; requiresAllowlist: boolean; expiresAt: Date | null;
  status: "active" | "revoked" | "expired" | "redeemed"; version: number; createdAt: Date; updatedAt: Date;
  redeemedByUserId: string | null; redeemedRequestId: string | null; redeemedAt: Date | null;
  revokedAt: Date | null; authorizationRevokedAt: Date | null;
};
/** Lifecycle proposals are not commits or proof that the recipient is authorized to redeem. */
export type PersonalInvitationChange = { changed: boolean; invitation: PersonalInvitation };

/** @param invitation - Current original resource. @param expectedVersion - Explicit observed version. @param now - Authoritative caller clock after locks. @returns Nothing after invariant checks. @throws AdmissionOperationError for stale/invalid versions or a nonmonotonic clock. */
function assertCurrentVersion(invitation: PersonalInvitation, expectedVersion: number, now: Date): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0 || !Number.isInteger(invitation.version) || invitation.version <= 0 || !Number.isFinite(now.getTime()) || now < invitation.updatedAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  if (expectedVersion !== invitation.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationConflict);
}

/** @param input - Server-assigned identity/clock and normalized policy plus explicit recipient, restrictions and optional expiry. @returns A detached version-one resource without token or access effects. @throws AdmissionOperationError when recipient, expiry, exemption or phone-OFF issuance is forbidden. */
export function createPersonalInvitation(input: { id: string; tribeId: string; actorUserId: string; contact: { type: AdmissionContactType; value: string; country?: string }; internalName: string; requiresAllowlist: boolean; allowlistExemptionAcknowledged: boolean; expiresAt?: Date | null; now: Date; policy: { contactType: AdmissionContactType; requiresAdditionalVerification: boolean } }): PersonalInvitation {
  if (!input.id || !input.tribeId || !input.actorUserId || !Number.isFinite(input.now.getTime()) || input.contact.type !== input.policy.contactType || !input.requiresAllowlist && !input.allowlistExemptionAcknowledged) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  if (input.policy.contactType === ADMISSION_CONTACT_TYPE.phone && !input.policy.requiresAdditionalVerification) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  const normalized = normalizeAdmissionContact(input.contact);
  if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const expiresAt = input.expiresAt === undefined ? new Date(input.now.getTime() + ADMISSION_LIMIT.invitationDefaultValidityMs) : input.expiresAt === null ? null : new Date(input.expiresAt);
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= input.now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return { id: input.id, tribeId: input.tribeId, createdByUserId: input.actorUserId, internalName: normalizePersonalInvitationName(input.internalName), contact: { ...normalized.contact }, requiresAllowlist: input.requiresAllowlist, expiresAt,
    status: ADMISSION_INVITATION_STATUS.active, version: 1, createdAt: new Date(input.now), updatedAt: new Date(input.now), redeemedByUserId: null, redeemedRequestId: null, redeemedAt: null, revokedAt: null, authorizationRevokedAt: null };
}

/** @param input - Current resource, observed version, descriptive label and post-lock clock. @returns Current no-op or one version increment; recipient/restrictions/token lineage never change. */
export function renamePersonalInvitation(input: { invitation: PersonalInvitation; expectedVersion: number; internalName: string; now: Date }): PersonalInvitationChange {
  assertCurrentVersion(input.invitation, input.expectedVersion, input.now);
  const internalName = normalizePersonalInvitationName(input.internalName);
  return internalName === input.invitation.internalName ? { changed: false, invitation: input.invitation } : { changed: true, invitation: { ...input.invitation, internalName, version: input.invitation.version + 1, updatedAt: new Date(input.now) } };
}

/** @param input - Locked live resource and original account/request lineage already authorized by the application owner. @returns A single-use redemption proposal without a membership or request effect. @throws AdmissionOperationError when already consumed/closed or the link expired before redemption. */
export function redeemPersonalInvitation(input: { invitation: PersonalInvitation; expectedVersion: number; userId: string; requestId: string; now: Date }): PersonalInvitationChange {
  assertCurrentVersion(input.invitation, input.expectedVersion, input.now);
  if (!input.userId || !input.requestId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  if (input.invitation.status !== ADMISSION_INVITATION_STATUS.active || input.invitation.expiresAt && input.now >= input.invitation.expiresAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  return { changed: true, invitation: { ...input.invitation, status: ADMISSION_INVITATION_STATUS.redeemed, version: input.invitation.version + 1, updatedAt: new Date(input.now), redeemedByUserId: input.userId, redeemedRequestId: input.requestId, redeemedAt: new Date(input.now) } };
}

/** @param input - Explicit observed version and separately acknowledged withdrawal of a redeemed authorization. @returns Terminal revocation or authorization withdrawal with original pending lineage; the writer must atomize any cancellation. */
export function revokePersonalInvitation(input: { invitation: PersonalInvitation; expectedVersion: number; revokeRedeemedAuthorization: boolean; now: Date }): PersonalInvitationChange & { cancelPendingRequestId: string | null } {
  assertCurrentVersion(input.invitation, input.expectedVersion, input.now);
  const invitation = input.invitation;
  if (invitation.status === ADMISSION_INVITATION_STATUS.redeemed) {
    if (!input.revokeRedeemedAuthorization) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (invitation.authorizationRevokedAt) return { changed: false, invitation, cancelPendingRequestId: null };
    return { changed: true, invitation: { ...invitation, version: invitation.version + 1, updatedAt: new Date(input.now), authorizationRevokedAt: new Date(input.now) }, cancelPendingRequestId: invitation.redeemedRequestId };
  }
  if (invitation.status !== ADMISSION_INVITATION_STATUS.active) return { changed: false, invitation, cancelPendingRequestId: null };
  return { changed: true, invitation: { ...invitation, status: ADMISSION_INVITATION_STATUS.revoked, version: invitation.version + 1, updatedAt: new Date(input.now), revokedAt: new Date(input.now) }, cancelPendingRequestId: null };
}

/** @param input - Current resource and server clock for explicit expiry materialization. @returns One active-to-expired increment or a no-op; redeemed authorization retains its independent request lifetime. */
export function expirePersonalInvitation(input: { invitation: PersonalInvitation; expectedVersion: number; now: Date }): PersonalInvitationChange {
  assertCurrentVersion(input.invitation, input.expectedVersion, input.now);
  if (input.invitation.status !== ADMISSION_INVITATION_STATUS.active || !input.invitation.expiresAt || input.now < input.invitation.expiresAt) return { changed: false, invitation: input.invitation };
  return { changed: true, invitation: { ...input.invitation, status: ADMISSION_INVITATION_STATUS.expired, version: input.invitation.version + 1, updatedAt: new Date(input.now) } };
}
