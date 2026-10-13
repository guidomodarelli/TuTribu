/** Validates untrusted restored policy intentions and projects only editable current settings. @module admission-policy-browser-intent */
import { z } from "zod";
import type { AdmissionPolicyDraft } from "./admission-policy-draft";
import type { AdmissionPolicyStateDto } from "../results/admission-policy-result-schemas";
import { createDefaultAdmissionPolicy, validateAdmissionPolicyDraftConfiguration } from "../../domain/entities/admission-policy";
import { ADMISSION_POLICY_MODE, ADMISSION_PHONE_CHANNEL, ADMISSION_POLICY_OPERATION } from "../../constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";

/** The browser has no actor, countries, operational marker or capability authority. */
const confirmationFields = { operationId: z.uuid(), confirmed: z.literal(true) };
const versionFields = { ...confirmationFields, expectedVersion: z.int().positive() };
export const admissionPolicyDraftSchema = z.strictObject({
  mode: z.enum(ADMISSION_POLICY_MODE), contactType: z.enum(ADMISSION_CONTACT_TYPE), isOpen: z.boolean(),
  allowCommonExceptions: z.boolean(), requiresAdditionalVerification: z.boolean(),
  phoneChannel: z.enum(ADMISSION_PHONE_CHANNEL).nullable(), allowSmsAlternative: z.boolean(),
  messagingConnectionId: z.uuid().nullable(), messagingConnectionVersion: z.int().positive().nullable(),
}).refine((draft) => (draft.messagingConnectionId === null) === (draft.messagingConnectionVersion === null));

/** A restored intention never restores the user's fresh UI confirmation. */
export const admissionPolicyBrowserIntentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal(ADMISSION_POLICY_OPERATION.initialize), input: z.strictObject(confirmationFields) }),
  z.strictObject({ type: z.literal(ADMISSION_POLICY_OPERATION.update), input: z.strictObject({ ...versionFields, ...admissionPolicyDraftSchema.shape }).refine((input) => (input.messagingConnectionId === null) === (input.messagingConnectionVersion === null)) }),
  z.strictObject({ type: z.literal(ADMISSION_POLICY_OPERATION.activate), input: z.strictObject(versionFields) }),
  z.strictObject({ type: z.literal(ADMISSION_POLICY_OPERATION.pause), input: z.strictObject({ ...versionFields, reason: z.string().trim().min(1).max(ADMISSION_LIMIT.internalMessageCharacters) }) }),
]);
export type AdmissionPolicyBrowserIntent = z.infer<typeof admissionPolicyBrowserIntentSchema>;

/** @param state - Safe current own state, including real absence. @returns Editable settings without fabricated persisted identity or counters. */
export function createAdmissionPolicyDraft(state: AdmissionPolicyStateDto): AdmissionPolicyDraft {
  const policy = state.policy ?? createDefaultAdmissionPolicy({ id: "", tribeId: "" });
  return { mode: policy.mode, contactType: policy.contactType, isOpen: policy.isOpen, allowCommonExceptions: policy.allowCommonExceptions,
    requiresAdditionalVerification: policy.requiresAdditionalVerification, phoneChannel: policy.phoneChannel, allowSmsAlternative: policy.allowSmsAlternative,
    messagingConnectionId: policy.messagingConnectionId, messagingConnectionVersion: policy.messagingConnectionVersion };
}

/** @param draft - Proposed editable settings. @param state - Current authorized projection, never a capability grant. @returns A structural incompatibility or null; operational readiness remains server-owned. */
export function validateAdmissionPolicyBrowserDraft(draft: AdmissionPolicyDraft, state: AdmissionPolicyStateDto): string | null {
  const tribeId = state.policy?.id ?? "";
  const result = validateAdmissionPolicyDraftConfiguration({ ...draft, tribeId }, { tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null, lockedContactType: state.impact.contactTypeLocked ? state.policy?.contactType : null });
  return result.valid ? null : result.reason;
}
