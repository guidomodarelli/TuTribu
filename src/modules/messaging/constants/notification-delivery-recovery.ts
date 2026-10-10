/** Names explicit notification recovery outcomes without relaxing uncertain-send gates. @module notification-delivery-recovery-constants */
export const NOTIFICATION_DELIVERY_RECOVERY_REASON = {
  notNotification: "notification_recovery_purpose_mismatch",
  expired: "notification_recovery_deadline_expired",
  wrongTribe: "notification_recovery_tenant_mismatch",
  sameConnection: "notification_recovery_connection_unchanged",
  connectionNotReady: "notification_recovery_connection_not_ready",
  securityScopeChanged: "notification_recovery_security_scope_changed",
  alreadyDelivered: "notification_recovery_already_delivered",
  possiblyDispatched: "notification_recovery_original_dispatch_unresolved",
  noCurrentObligation: "notification_recovery_obligation_unavailable",
} as const;

/** Restricts this recovery to notification obligations, never OTP or connection diagnostics. */
export const NOTIFICATION_DELIVERY_RECOVERY_PURPOSE = "admission_notification";
