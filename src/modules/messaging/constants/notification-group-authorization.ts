/** Owns the generic audit surface of a definitively unavailable grouped resource. @module notification-group-authorization-constants */
/** Uses the existing closed delivery-suppression event rather than creating another lifecycle. */
export const NOTIFICATION_GROUP_SUPPRESSION_AUDIT_EVENT = "delivery_suppressed";
/** Identifies the native whole-group pre-marker rule independently of an upstream failure. */
export const NOTIFICATION_GROUP_SUPPRESSION_AUDIT_RULE = "authorize_notification_group";
/** Identifies an old reference-only source that cannot provide a complete frozen email. */
export const NOTIFICATION_REFERENCE_SUPPRESSION_AUDIT_RULE = "authorize_notification_reference";
