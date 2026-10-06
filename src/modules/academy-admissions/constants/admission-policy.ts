/**
 * Defines policy modes and configuration outcomes without transport concerns.
 *
 * @module admission-policy-constants
 */

/** Selects automatic allowlist admission or deliberate manual review. */
export const ADMISSION_POLICY_MODE = { allowlist: "allowlist", manualReview: "manual_review" } as const;

/** Identifies explicitly selected phone transports; provider fallback is separate. */
export const ADMISSION_PHONE_CHANNEL = { sms: "sms", whatsapp: "whatsapp" } as const;

/** Names incompatible settings for safe mapping at the application boundary. */
export const ADMISSION_POLICY_CONFIGURATION_ERROR = {
  scopeMismatch: "policy_scope_mismatch",
  contactTypeLocked: "contact_type_locked",
  phoneAllowlistVerificationRequired: "phone_allowlist_verification_required",
  verificationUnavailable: "verification_unavailable",
  verificationQuotaUnavailable: "verification_quota_unavailable",
  phoneChannelRequired: "phone_channel_required",
  countriesNotConfigured: "recipient_countries_not_configured",
  countriesRestricted: "recipient_countries_restricted",
  smsAlternativeInvalid: "sms_alternative_invalid",
  smsAlternativeUnavailable: "sms_alternative_unavailable",
} as const;

/** Warns that manual phone/OFF supports common submissions only. */
export const ADMISSION_POLICY_CONFIGURATION_WARNING = { phoneInvitationsUnavailable: "phone_invitations_unavailable" } as const;

/** Limits mutation proposals to policy settings; identity and counters stay server-owned. */
export const ADMISSION_POLICY_EDITABLE_FIELDS = [
  "mode", "contactType", "isOpen", "allowCommonExceptions", "requiresAdditionalVerification",
  "phoneChannel", "allowSmsAlternative", "messagingConnectionId", "messagingConnectionVersion",
] as const;

/** Distinguishes a new proposal from a no-op, stale version, or invalid configuration. */
export const ADMISSION_POLICY_CHANGE_OUTCOME = { changed: "changed", unchanged: "unchanged", conflict: "conflict", invalid: "invalid" } as const;
