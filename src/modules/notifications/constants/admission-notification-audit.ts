/** Owns fixed admission notice facts independently of transport deliveries and presentation copy. @module admission-notification-audit */
/** No recipient, title, contact or body is copied into this audit contract. */
export const ADMISSION_NOTIFICATION_AUDIT = { resourceType: "admission_notification", obligationCreated: "notification_obligation_created", materialized: "notification_materialized", createRule: "record_admission_notification_obligation", materializeRule: "materialize_admission_notification", factIndex: "admission_notification_audit_fact_key" } as const;
/** Mirrors original obligation sources; reminder remains a reserved source until its own producer is implemented. */
export const ADMISSION_NOTIFICATION_AUDIT_SOURCES = ["pending_created", "approved", "rejected", "cancelled", "expired", "reminder"] as const;
