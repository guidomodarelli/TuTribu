/** Owns explicit membership commands and their durable operation namespace. @module tribe-membership-lifecycle-constants */
export const TRIBE_MEMBERSHIP_LIFECYCLE_ACTION = { leave: "leave", remove: "remove", block: "block" } as const;
/** Separates membership mutations from admission approvals and payment operations. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_OPERATION = "change_tribe_membership";
/** Defines safe failures for membership changes without provider or database diagnostics. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_ERROR = {
  authenticationRequired: "authentication_required", permissionDenied: "permission_denied", invalidInput: "invalid_input",
  resourceUnavailable: "resource_unavailable", membershipConflict: "membership_conflict", idempotencyConflict: "idempotency_conflict",
  operationUnresolved: "operation_unresolved", publicContractUnusable: "public_contract_unusable", unexpectedFailure: "unexpected_failure",
  /** The platform cannot protect the original yet; nothing was registered and only the TuTribu team can fix it. */
  platformSecurityUnavailable: "platform_security_unavailable",
} as const;
/** Owns the explicit set of commands accepted at the HTTP boundary. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_ACTIONS = ["leave", "remove", "block"] as const;
/** Known command rejections remain original terminal outcomes rather than unresolved work. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME = { changed: "changed", denied: "denied" } as const;
/** Only these current domain rejections may be recorded as a known command result. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_DENIAL_CODES = ["permission_denied", "resource_unavailable", "membership_conflict"] as const;
