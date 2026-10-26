/** Defines explicit browser proposals separately from durable original-operation references. @module personal-invitation-management-intent */
import type { PersonalInvitationManagementResult } from "../results/admission-resource-result";

/** Form values never imply confirmation, verification or a persisted invitation. */
export type PersonalInvitationManagementDraft = { mode: "create" | "rename" | "revoke"; selected: PersonalInvitationManagementResult | null; internalName: string; identity: string; country: string; requiresAllowlist: boolean; exemptionAcknowledged: boolean; expiry: string; noExpiry: boolean; noExpiryAcknowledged: boolean; replaceSelected: boolean; replacementAcknowledged: boolean; internalReason: string; withdrawalAcknowledged: boolean };
/** Original references contain no recipient, token, URL, code or consent. */
export type PersonalInvitationManagementReference = { type: "create_personal_invitation" | "rename_personal_invitation" | "revoke_personal_invitation"; operationId: string; invitationId: string | null; expectedVersion: number | null };
/** Each request preserves its confirmed purpose; only a new creation may replace another observed resource. */
export type PersonalInvitationManagementIntent =
  | { type: "create_personal_invitation"; input: { operationId: string; confirmed: true; internalName: string; recipient: { type: "email" | "phone"; value: string; country?: string }; requiresAllowlist: boolean; acknowledgeNoAllowlist?: true; expiresAt: string | null; replacement?: { invitationId: string; expectedVersion: number } } }
  | { type: "rename_personal_invitation"; invitationId: string; input: { operationId: string; confirmed: true; internalName: string; expectedVersion: number } }
  | { type: "revoke_personal_invitation"; invitationId: string; input: { operationId: string; confirmed: true; reason: string; expectedVersion: number; revokeRedeemedAuthorization: boolean } };
