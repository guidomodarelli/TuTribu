/** Names explicit notification recovery outcomes without relaxing uncertain-send gates. @module notification-delivery-recovery-constants */
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
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

/** Names immutable lineage and its authorizing security audit without exposing recipient data. */
export const NOTIFICATION_DELIVERY_RECOVERY_AUDIT = {
  resourceType: "message_delivery",
  eventType: "notification_delivery_recovered",
  rule: "explicit_notification_recovery",
  cause: "authorized_connection_replacement",
} as const;

/** Keeps newly persisted recovery intent distinct from code payload and operation fingerprints. */
export const NOTIFICATION_DELIVERY_RECOVERY_PAYLOAD_DOMAIN = "tutribu.notification.recovery.v1";

/** Maps private domain denials to the reused ledger's closed safe outcome vocabulary. */
export const NOTIFICATION_DELIVERY_RECOVERY_ERROR_BY_REASON = {
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.notNotification]: ADMISSION_ERROR_CODE.permissionDenied,
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.expired]: ADMISSION_ERROR_CODE.challengeExpired,
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.wrongTribe]: ADMISSION_ERROR_CODE.permissionDenied,
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.sameConnection]: ADMISSION_ERROR_CODE.connectionConflict,
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.connectionNotReady]: ADMISSION_ERROR_CODE.connectionIncomplete,
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.securityScopeChanged]: ADMISSION_ERROR_CODE.connectionIncomplete,
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.alreadyDelivered]: ADMISSION_ERROR_CODE.resourceUnavailable,
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.possiblyDispatched]: ADMISSION_ERROR_CODE.deliveryUnknown,
  [NOTIFICATION_DELIVERY_RECOVERY_REASON.noCurrentObligation]: ADMISSION_ERROR_CODE.resourceUnavailable,
} as const satisfies Record<string, AdmissionErrorCode>;
