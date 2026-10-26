/** Names explicit durable group provenance independently of an original single obligation. @module notification-group-origin-constants */
/** Projects only opaque scope for the lifetime of retained delivery references. */
export const NOTIFICATION_GROUP_ORIGIN_STORAGE = {
  table: "messaging_notification_group_origins",
  primaryKey: "messaging_notification_group_origins_pkey",
  scopeKey: "messaging_notification_group_origin_scope_key",
  namespaceForeignKey: "messaging_notification_group_origin_namespace_fkey",
  audienceCheck: "messaging_notification_group_origins_audience_check",
  deliveryForeignKey: "messaging_delivery_notification_group_origin_fkey",
  deliveryScopeCheck: "messaging_delivery_notification_group_scope_check",
  deliveryIndex: "messaging_delivery_notification_group_origin_idx",
} as const;
