/** Names the private retained-delivery origin independently of executable operation storage. @module notification-recovery-origin-constants */
export const NOTIFICATION_RECOVERY_ORIGIN_STORAGE = {
  table: "messaging_notification_recovery_origins",
  primaryKey: "messaging_notification_recovery_origins_pkey",
  namespaceForeignKey: "messaging_notification_recovery_origin_namespace_fkey",
  deliveryForeignKey: "messaging_delivery_recovery_operation_fkey",
} as const;
