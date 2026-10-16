/** Owns current whole-group authority outcomes without adopting provider state as permission. @module admission-notification-group-authority-constants */
import type { AdmissionNotificationGroupAuthorityReason } from "../domain/entities/admission-notification-group-authority";

/** Reports a complete current native group, not a durable send token. */
export const ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT = "current";
/** Rejects an obsolete scope before budget or protected material. */
export const ADMISSION_NOTIFICATION_GROUP_AUTHORITY_DENIED = "denied";
/** Names missing original group lineage without inferring an individual obligation. */
export const ADMISSION_NOTIFICATION_GROUP_UNAVAILABLE = "notification_group_unavailable";
/** Requires the original group to have completed its native freeze. */
export const ADMISSION_NOTIFICATION_GROUP_NOT_FROZEN = "notification_group_not_frozen";
/** Rejects missing, added, reordered or changed original member metadata. */
export const ADMISSION_NOTIFICATION_GROUP_MANIFEST_CHANGED = "notification_group_manifest_changed";
/** Refuses to redirect an original send to another selected resource. */
export const ADMISSION_NOTIFICATION_GROUP_CONNECTION_CHANGED = "notification_connection_changed";
/** Refuses content that cannot authenticate against the original complete intent. */
export const ADMISSION_NOTIFICATION_GROUP_PAYLOAD_UNUSABLE = "notification_payload_unusable";
/** Keeps group-specific denials separate from the existing per-source suppression vocabulary. */
export const ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON = { unavailable: ADMISSION_NOTIFICATION_GROUP_UNAVAILABLE, notFrozen: ADMISSION_NOTIFICATION_GROUP_NOT_FROZEN, manifestChanged: ADMISSION_NOTIFICATION_GROUP_MANIFEST_CHANGED, connectionChanged: ADMISSION_NOTIFICATION_GROUP_CONNECTION_CHANGED, payloadUnusable: ADMISSION_NOTIFICATION_GROUP_PAYLOAD_UNUSABLE } as const satisfies Record<string, AdmissionNotificationGroupAuthorityReason>;
