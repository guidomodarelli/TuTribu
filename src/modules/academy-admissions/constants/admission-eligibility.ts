/**
 * Names admission outcomes, evidence, and denial reasons without HTTP or UI copy.
 *
 * @module admission-eligibility-constants
 */
export const ADMISSION_OUTCOME = {
  admitted: "admitted", pending: "pending", alreadyMember: "already_member",
  denied: "denied", verificationRequired: "verification_required",
} as const;
export const ADMISSION_EVIDENCE_KIND = { none: "none", declared: "declared", base: "base", local: "local" } as const;
export const ADMISSION_MEMBERSHIP_EFFECT = { none: "none", create: "create", recover: "recover" } as const;
export const ADMISSION_DENIAL_REASON = {
  unauthenticated: "unauthenticated",
  closed: "admission_closed",
  scopeMismatch: "admission_scope_mismatch",
  contactAccountMismatch: "contact_account_mismatch",
  contactTypeMismatch: "contact_type_mismatch",
  contactConflict: "contact_conflict",
  allowlistUnmet: "allowlist_requirement_unmet",
  invitationUnusable: "invitation_unusable",
  invitationRecipientUnproven: "invitation_recipient_unproven",
  phoneInvitationUnavailable: "phone_invitation_unavailable",
  membershipRestricted: "membership_restricted",
  recoveryUnknown: "membership_recovery_unknown",
  proofRequired: "local_proof_required",
  reviewerUnauthorized: "reviewer_unauthorized",
  requestExpired: "request_expired",
  evidenceRevoked: "evidence_revoked",
  exceptionReasonRequired: "exception_reason_required",
} as const;
export const ADMISSION_SOURCE_KIND = { common: "common", personal: "personal" } as const;
export const ADMISSION_INVITATION_STATUS = { active: "active", redeemed: "redeemed", revoked: "revoked", expired: "expired" } as const;
export const ADMISSION_PROOF_STATUS = { available: "available", applied: "applied", invalid: "invalid" } as const;
export const ADMISSION_VERIFICATION_PURPOSE = { admission: "admission", connectionDiagnostic: "connection_diagnostic" } as const;
export const ADMISSION_GLOBAL_EMAIL_AUTHORITY = { gmail: "gmail", workspace: "workspace", insufficient: "insufficient" } as const;
export const ADMISSION_ACTION = {
  readPolicy: "read_policy", configurePolicy: "configure_policy", manageAllowlist: "manage_allowlist",
  manageInvitations: "manage_invitations", manageConnection: "manage_connection",
  readConnectionMetadata: "read_connection_metadata", readSecret: "read_secret",
  readConnectionAlert: "read_connection_alert",
  readInbox: "read_inbox", decideRequest: "decide_request", rejectRequest: "reject_request",
  cancelByManagement: "cancel_by_management", allowEarlyRetry: "allow_early_retry",
  readAudit: "read_audit", readReviewHistory: "read_review_history",
  readOwnRequest: "read_own_request", cancelOwnRequest: "cancel_own_request",
  attachOwnProof: "attach_own_proof", updateOwnNotificationPreferences: "update_own_notification_preferences",
  grantProductOrRole: "grant_product_or_role",
} as const;
