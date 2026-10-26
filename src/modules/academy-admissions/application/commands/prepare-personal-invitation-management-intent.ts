/** Converts an explicitly confirmed form proposal into one canonical administrative intent. @module prepare-personal-invitation-management-intent */
import type { PersonalInvitationManagementDraft, PersonalInvitationManagementIntent } from "./personal-invitation-management-intent";
import type { PersonalInvitationManagementPageState } from "../results/personal-invitation-management-page-state";
import { normalizeAdmissionContact } from "../../domain/value-objects/admission-contact";
import { normalizePersonalInvitationName } from "../../domain/value-objects/personal-invitation-name";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS, ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { PERSONAL_INVITATION_MANAGEMENT_MODE } from "../../constants/personal-invitation-management-browser";
import { fromBuenosAiresMinuteKey, toBuenosAiresMinuteKey } from "@/src/modules/shared/application/date-time/buenos-aires-minute";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_INVITATION_STATUS } from "../../constants/admission-eligibility";

/** @param state - Safe current settings. @returns A deterministic fresh proposal in Argentina time, without restored consent. */
export function emptyPersonalInvitationManagementDraft(state: Extract<PersonalInvitationManagementPageState, { kind: "ready" }>): PersonalInvitationManagementDraft {
  return { mode: PERSONAL_INVITATION_MANAGEMENT_MODE.create, selected: null, internalName: "", identity: "", country: state.allowedCountries[0] ?? "", requiresAllowlist: state.hasUsableAllowlist, exemptionAcknowledged: false, expiry: toBuenosAiresMinuteKey(new Date(new Date(state.renderedAt).getTime() + ADMISSION_LIMIT.invitationDefaultValidityMs)), noExpiry: false, noExpiryAcknowledged: false, replaceSelected: false, replacementAcknowledged: false, internalReason: "", withdrawalAcknowledged: false };
}
/** @param state - Current safe settings. @param draft - Current proposal without durable authority. @param operationId - New secure original UUID. @param now - Client clock used only for pre-action feedback; SQL remains authoritative. @returns Canonical intent or a controlled validation failure before dispatch. */
export function preparePersonalInvitationManagementIntent(state: Extract<PersonalInvitationManagementPageState, { kind: "ready" }>, draft: PersonalInvitationManagementDraft, operationId: string, now: Date): PersonalInvitationManagementIntent {
  const invalid = () => new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  if (draft.mode === PERSONAL_INVITATION_MANAGEMENT_MODE.rename && draft.selected) return { type: REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId: draft.selected.id, input: { operationId, confirmed: true, expectedVersion: draft.selected.version, internalName: normalizePersonalInvitationName(draft.internalName) } };
  if (draft.mode === PERSONAL_INVITATION_MANAGEMENT_MODE.revoke && draft.selected) {
    const reason = draft.internalReason.trim(), withdrawal = draft.selected.status === "redeemed";
    if (!reason || reason.length > ADMISSION_LIMIT.internalMessageCharacters || withdrawal && (!draft.withdrawalAcknowledged || draft.selected.authorizationRevokedAt !== null)) throw invalid();
    return { type: REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId: draft.selected.id, input: { operationId, confirmed: true, expectedVersion: draft.selected.version, reason, revokeRedeemedAuthorization: withdrawal } };
  }
  if (draft.mode !== PERSONAL_INVITATION_MANAGEMENT_MODE.create || !state.contactType || state.contactType === ADMISSION_CONTACT_TYPE.phone && !state.requiresAdditionalVerification || draft.requiresAllowlist && !state.hasUsableAllowlist || !draft.requiresAllowlist && !draft.exemptionAcknowledged || draft.noExpiry && !draft.noExpiryAcknowledged || draft.replaceSelected && (!draft.selected || !draft.replacementAcknowledged)) throw invalid();
  const contact = normalizeAdmissionContact({ type: state.contactType, value: draft.identity, country: draft.country || undefined });
  if (contact.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid || contact.contact.type === ADMISSION_CONTACT_TYPE.phone && !state.allowedCountries.includes(contact.contact.country)) throw invalid();
  if (draft.replaceSelected && draft.selected && (draft.selected.status !== ADMISSION_INVITATION_STATUS.active || contact.contact.type !== draft.selected.recipient.type || contact.contact.value !== draft.selected.recipient.value || contact.contact.type === ADMISSION_CONTACT_TYPE.phone && contact.contact.country !== draft.selected.recipient.country)) throw invalid();
  // The leader picks the expiry in Argentina time; a value that does not name one real minute is rejected.
  const expiresAt = draft.noExpiry ? null : fromBuenosAiresMinuteKey(draft.expiry);
  if (!draft.noExpiry && (!expiresAt || expiresAt <= now)) throw invalid();
  return { type: REAUTHENTICATION_OPERATION.createPersonalInvitation, input: { operationId, confirmed: true, internalName: normalizePersonalInvitationName(draft.internalName), recipient: { type: contact.contact.type, value: contact.contact.value, ...(contact.contact.type === ADMISSION_CONTACT_TYPE.phone ? { country: contact.contact.country } : {}) }, requiresAllowlist: draft.requiresAllowlist, ...(!draft.requiresAllowlist ? { acknowledgeNoAllowlist: true } : {}), expiresAt: expiresAt?.toISOString() ?? null, ...(draft.replaceSelected && draft.selected ? { replacement: { invitationId: draft.selected.id, expectedVersion: draft.selected.version } } : {}) } };
}
