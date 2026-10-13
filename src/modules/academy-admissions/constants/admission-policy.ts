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

/** Closes activation when its actual platform/tenant preparation is unavailable. */
export const ADMISSION_POLICY_ACTIVATION_ERROR = {
  policyMissing: "policy_unavailable", notAcademy: "academy_unavailable", preflightIncomplete: "admission_preflight_incomplete",
  evaluatorUnavailable: "admission_evaluator_unavailable", recoveryLocked: "admission_recovery_locked", clockInvalid: "admission_clock_invalid",
} as const;

/** Original ledger namespaces keep creation, edit, activation and pause intents distinct. */
export const ADMISSION_POLICY_OPERATION = { initialize: "initialize_admission_policy", update: "update_admission_policy", activate: "activate_admission_policy", pause: "pause_admission_policy" } as const;
/** Recovery is read-only and requires current leadership, independently of mutation recency. */
export const ADMISSION_POLICY_RECOVERABLE_OPERATIONS: readonly string[] = Object.values(ADMISSION_POLICY_OPERATION);

/** Own audit vocabulary distinguishes durable configuration changes from request decisions. */
export const ADMISSION_POLICY_AUDIT = { resourceType: "admission_policy", invalidationRule: "policy_verification_context_changed" } as const;
/** Public lifecycle distinguishes real absence from a protected but unavailable resource. */
export const ADMISSION_POLICY_PUBLIC_STATE = { notConfigured: "not_configured", draft: "draft", active: "active", paused: "paused", unavailable: "unavailable" } as const;
/** An informational query never represents an unperformed preflight as successful. */
export const ADMISSION_POLICY_PREPARATION_STATE = { notEvaluated: "not_evaluated", evaluated: "evaluated" } as const;
