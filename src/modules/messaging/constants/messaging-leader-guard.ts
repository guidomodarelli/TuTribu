/** Outcomes of the consolidated SQL messaging leadership guards. @module messaging-leader-guard-constants */

/** Every outcome `authorize_messaging_configuration_reader` and `authorize_messaging_tribe_management` return. */
export type MessagingGuardOutcome = "authorized" | "checked" | "permission_denied" | "authentication_required";

export const MESSAGING_GUARD_OUTCOME = {
  /** Tribe management passed every check. */
  authorized: "authorized",
  /** Configuration rows are locked and the session is live; the audience decision is the caller's. */
  checked: "checked",
  permissionDenied: "permission_denied",
  authenticationRequired: "authentication_required",
} as const satisfies Record<string, MessagingGuardOutcome>;
