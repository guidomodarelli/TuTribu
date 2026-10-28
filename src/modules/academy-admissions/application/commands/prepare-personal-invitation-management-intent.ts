/** Converts an explicitly confirmed form proposal into one canonical administrative intent. @module prepare-personal-invitation-management-intent */
import type { PersonalInvitationManagementDraft, PersonalInvitationManagementIntent } from "./personal-invitation-management-intent";
import type { PersonalInvitationManagementPageState } from "../results/personal-invitation-management-page-state";
import { normalizeAdmissionContact, type AdmissionContact } from "../../domain/value-objects/admission-contact";
import { normalizePersonalInvitationName } from "../../domain/value-objects/personal-invitation-name";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS, ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { PERSONAL_INVITATION_MANAGEMENT_MODE } from "../../constants/personal-invitation-management-browser";
import { fromBuenosAiresMinuteKey, toBuenosAiresMinuteKey } from "@/src/modules/shared/application/date-time/buenos-aires-minute";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_INVITATION_STATUS } from "../../constants/admission-eligibility";

type ReadyPersonalInvitationManagementState = Extract<PersonalInvitationManagementPageState, { kind: "ready" }>;
type SelectedPersonalInvitation = NonNullable<PersonalInvitationManagementDraft["selected"]>;

/** @param state - Safe current settings. @returns A deterministic fresh proposal in Argentina time, without restored consent. */
export function emptyPersonalInvitationManagementDraft(state: Extract<PersonalInvitationManagementPageState, { kind: "ready" }>): PersonalInvitationManagementDraft {
  return { mode: PERSONAL_INVITATION_MANAGEMENT_MODE.create, selected: null, internalName: "", identity: "", country: state.allowedCountries[0] ?? "", requiresAllowlist: state.hasUsableAllowlist, exemptionAcknowledged: false, expiry: toBuenosAiresMinuteKey(new Date(new Date(state.renderedAt).getTime() + ADMISSION_LIMIT.invitationDefaultValidityMs)), noExpiry: false, noExpiryAcknowledged: false, replaceSelected: false, replacementAcknowledged: false, internalReason: "", withdrawalAcknowledged: false };
}
/** @param state - Current safe settings. @param draft - Current proposal without durable authority. @param operationId - New secure original UUID. @param now - Client clock used only for pre-action feedback; SQL remains authoritative. @returns Canonical intent or a controlled validation failure before dispatch. */
export function preparePersonalInvitationManagementIntent(state: Extract<PersonalInvitationManagementPageState, { kind: "ready" }>, draft: PersonalInvitationManagementDraft, operationId: string, now: Date): PersonalInvitationManagementIntent {
  if (draft.mode === PERSONAL_INVITATION_MANAGEMENT_MODE.rename && draft.selected) return { type: REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId: draft.selected.id, input: { operationId, confirmed: true, expectedVersion: draft.selected.version, internalName: normalizePersonalInvitationName(draft.internalName) } };
  if (draft.mode === PERSONAL_INVITATION_MANAGEMENT_MODE.revoke && draft.selected) return prepareRevokeIntent(draft, draft.selected, operationId);
  return prepareCreateIntent(state, draft, operationId, now);
}

/** @returns The controlled validation failure raised before dispatch. */
function invalidIntent(): AdmissionOperationError {
  return new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
}

/** @param draft - Current revoke proposal. @param selected - Invitation being revoked. @param operationId - New secure original UUID. @returns Canonical revoke intent. */
function prepareRevokeIntent(draft: PersonalInvitationManagementDraft, selected: SelectedPersonalInvitation, operationId: string): PersonalInvitationManagementIntent {
  const reason = draft.internalReason.trim(), withdrawal = selected.status === "redeemed";
  if (!reason || reason.length > ADMISSION_LIMIT.internalMessageCharacters || withdrawal && (!draft.withdrawalAcknowledged || selected.authorizationRevokedAt !== null)) throw invalidIntent();
  return { type: REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId: selected.id, input: { operationId, confirmed: true, expectedVersion: selected.version, reason, revokeRedeemedAuthorization: withdrawal } };
}

/** @param state - Current safe settings. @param draft - Current create proposal. @returns Whether the proposal breaks a create precondition. */
function breaksCreatePreconditions(state: ReadyPersonalInvitationManagementState, draft: PersonalInvitationManagementDraft): boolean {
  return draft.mode !== PERSONAL_INVITATION_MANAGEMENT_MODE.create || state.contactType === ADMISSION_CONTACT_TYPE.phone && !state.requiresAdditionalVerification || draft.requiresAllowlist && !state.hasUsableAllowlist || !draft.requiresAllowlist && !draft.exemptionAcknowledged || draft.noExpiry && !draft.noExpiryAcknowledged || draft.replaceSelected && (!draft.selected || !draft.replacementAcknowledged);
}

/** @param selected - Invitation being replaced. @param contact - Normalized new recipient. @returns Whether the replacement cannot reuse that invitation. */
function breaksReplacement(selected: SelectedPersonalInvitation, contact: AdmissionContact): boolean {
  return selected.status !== ADMISSION_INVITATION_STATUS.active || contact.type !== selected.recipient.type || contact.value !== selected.recipient.value || contact.type === ADMISSION_CONTACT_TYPE.phone && contact.country !== selected.recipient.country;
}

/** @param state - Current safe settings. @param draft - Current create proposal. @param operationId - New secure original UUID. @param now - Client clock for pre-action feedback. @returns Canonical create intent. */
function prepareCreateIntent(state: ReadyPersonalInvitationManagementState, draft: PersonalInvitationManagementDraft, operationId: string, now: Date): PersonalInvitationManagementIntent {
  if (!state.contactType || breaksCreatePreconditions(state, draft)) throw invalidIntent();
  const contact = normalizeAdmissionContact({ type: state.contactType, value: draft.identity, country: draft.country || undefined });
  if (contact.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid || contact.contact.type === ADMISSION_CONTACT_TYPE.phone && !state.allowedCountries.includes(contact.contact.country)) throw invalidIntent();
  if (draft.replaceSelected && draft.selected && breaksReplacement(draft.selected, contact.contact)) throw invalidIntent();
  // The leader picks the expiry in Argentina time; a value that does not name one real minute is rejected.
  const expiresAt = draft.noExpiry ? null : fromBuenosAiresMinuteKey(draft.expiry);
  if (!draft.noExpiry && (!expiresAt || expiresAt <= now)) throw invalidIntent();
  return { type: REAUTHENTICATION_OPERATION.createPersonalInvitation, input: { operationId, confirmed: true, internalName: normalizePersonalInvitationName(draft.internalName), recipient: { type: contact.contact.type, value: contact.contact.value, ...(contact.contact.type === ADMISSION_CONTACT_TYPE.phone ? { country: contact.contact.country } : {}) }, requiresAllowlist: draft.requiresAllowlist, ...(!draft.requiresAllowlist ? { acknowledgeNoAllowlist: true } : {}), expiresAt: expiresAt?.toISOString() ?? null, ...(draft.replaceSelected && draft.selected ? { replacement: { invitationId: draft.selected.id, expectedVersion: draft.selected.version } } : {}) } };
}
