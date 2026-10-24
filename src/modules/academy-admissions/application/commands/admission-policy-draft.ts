/** Defines editable UI intent separately from server identity, activation and independent counters. @module admission-policy-draft */
export type AdmissionPolicyDraft = {
  mode: "manual_review" | "allowlist"; contactType: "email" | "phone"; isOpen: boolean;
  allowCommonExceptions: boolean; requiresAdditionalVerification: boolean;
  requiresWhatsappNumber?: boolean;
  phoneChannel: "sms" | "whatsapp" | null; allowSmsAlternative: boolean;
};
