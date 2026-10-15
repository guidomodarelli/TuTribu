/** Selects reconstructible policy configuration without command bodies or personal data. @module admission-policy-audit-snapshot */
import type { AdmissionPolicy } from "./admission-policy";

/** Own immutable audit configuration; identity and version remain on the enclosing event. */
export type AdmissionPolicyAuditSnapshot = {
  mode: "manual_review" | "allowlist"; contactType: "email" | "phone"; isOpen: boolean;
  allowCommonExceptions: boolean; requiresAdditionalVerification: boolean;
  phoneChannel: "sms" | "whatsapp" | null; allowSmsAlternative: boolean;
  messagingConnectionId: string | null; messagingConnectionVersion: number | null;
  verificationEpoch: number; activatedAt: string | null;
};

/**
 * Selects the same fixed fields from an own live policy or its serialized audit snapshot.
 * @param policy - Owner-derived configuration, never a request/provider body.
 * @returns A fresh record whose activation clock cannot change with the caller's Date.
 */
export function selectAdmissionPolicyAuditSnapshot(policy: AdmissionPolicy | AdmissionPolicyAuditSnapshot): AdmissionPolicyAuditSnapshot {
  return { mode: policy.mode, contactType: policy.contactType, isOpen: policy.isOpen,
    allowCommonExceptions: policy.allowCommonExceptions, requiresAdditionalVerification: policy.requiresAdditionalVerification,
    phoneChannel: policy.phoneChannel, allowSmsAlternative: policy.allowSmsAlternative,
    messagingConnectionId: policy.messagingConnectionId, messagingConnectionVersion: policy.messagingConnectionVersion,
    verificationEpoch: policy.verificationEpoch,
    activatedAt: policy.activatedAt instanceof Date ? policy.activatedAt.toISOString() : policy.activatedAt };
}
