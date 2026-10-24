/** Owns the fixed admission workflow vocabulary and bounded observation policy. @module admission-messaging-maintenance-constants */
import { MESSAGING_DISPATCH_BOUND } from "./messaging-dispatch";
import type { AdmissionMessagingMaintenancePhase, AdmissionMessagingMaintenancePhaseStatus, AdmissionMessagingMaintenanceReason, AdmissionMessagingMaintenanceMetricKey } from "../domain/repositories/admission-messaging-maintenance";

/** Bounds the whole invocation by the existing dispatcher maximum, including observation time. */
export const ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS = MESSAGING_DISPATCH_BOUND.maximumRunBudgetMs;
/**
 * Stops starting phases this long before the run deadline so the last observation and the final record still commit inside it.
 * Both together are about a dozen sequential statements; at the ~165 ms round trip measured in the SC-015 pilot that is ~2 s.
 * Smaller test budgets use a proportional share instead (see the use case).
 */
export const ADMISSION_MESSAGING_MAINTENANCE_FINISH_RESERVE_MS = 5_000;
/** Leaves an original late operation a bounded grace period without authorizing a resend. */
export const ADMISSION_MESSAGING_MAINTENANCE_LEASE_SECONDS = 90;
/** Matches the existing bounded original-lease reconciliation owner, independently of dispatch batch size. */
export const ADMISSION_MESSAGING_MAINTENANCE_RECONCILIATION_LIMIT = 100;
/** Defines the fixed phases and their rotation; logical reminders remain independent of optional email. */
export const ADMISSION_MESSAGING_MAINTENANCE_PHASES = ["expire_requests", "purge_admission", "purge_messaging", "materialize_reminders", "prepare_notifications", "dispatch_outbox", "reconcile_leases"] as const satisfies readonly AdmissionMessagingMaintenancePhase[];
/** Owns fixed phase names without deriving the domain union from these values. */
export const ADMISSION_MESSAGING_MAINTENANCE_PHASE = { expiration: "expire_requests", admissionRetention: "purge_admission", messagingRetention: "purge_messaging", reminders: "materialize_reminders", notifications: "prepare_notifications", dispatch: "dispatch_outbox", reconciliation: "reconcile_leases" } as const satisfies Record<string, AdmissionMessagingMaintenancePhase>;
/** Separates a deliberate omission from an indeterminate original mutation. */
export const ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS = { completed: "completed", deferred: "deferred", failed: "failed", unresolved: "unresolved", notConfigured: "not_configured", notRun: "not_run" } as const satisfies Record<string, AdmissionMessagingMaintenancePhaseStatus>;
/** Marks the original phase as processing before its business effect is allowed to begin. */
export const ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE = "running";
/** Separates persistence from the business result it observes. */
export const ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION = { recorded: "recorded", unavailable: "unavailable", pending: "pending", notRun: "not_run" } as const;
/** Describes only this bounded invocation, never global queue exhaustion. */
export const ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS = { completed: "completed", incomplete: "incomplete", busy: "busy", unresolved: "unresolved" } as const;
/** Contains only public-safe operational reasons. */
export const ADMISSION_MESSAGING_MAINTENANCE_REASON = { authorityUnavailable: "authority_unavailable", recoveryLocked: "recovery_locked", configurationUnavailable: "configuration_unavailable", operationUnresolved: "operation_unresolved", observationUnavailable: "observation_unavailable", deadlineReached: "deadline_reached", phaseFailed: "phase_failed" } as const satisfies Record<string, AdmissionMessagingMaintenanceReason>;
/** Names safe diagnostic boundaries independently of a provider exception. */
export const ADMISSION_MESSAGING_MAINTENANCE_OPERATION = { begin: "begin_admission_messaging_maintenance", phase: "run_admission_messaging_maintenance_phase", record: "record_admission_messaging_maintenance_phase", finish: "finish_admission_messaging_maintenance", late: "record_late_admission_messaging_maintenance" } as const;
/** Retains units for every confirmed owner count, without IDs as metric labels. */
export const ADMISSION_MESSAGING_MAINTENANCE_METRIC = { expiredRequests: "expired_requests", purgedImportRows: "purged_import_rows", completedImports: "completed_imports", minimizedRequests: "minimized_requests", purgedAuditEvents: "purged_audit_events", purgedArchivedAuditEvents: "purged_archived_audit_events", expiredCandidates: "expired_candidates", purgedCandidateSecrets: "purged_candidate_secrets", purgedRetiredSecrets: "purged_retired_secrets", purgedVerificationMaterial: "purged_verification_material", createdReminders: "created_reminders", selectedNotificationTribes: "selected_notification_tribes", collectedNotificationSources: "collected_notification_sources", preparedNotificationGroups: "prepared_notification_groups", claimedDeliveries: "claimed_deliveries", authorizedDeliveries: "authorized_deliveries", acceptedDeliveries: "accepted_deliveries", deliveredDeliveries: "delivered_deliveries", rejectedDeliveries: "rejected_deliveries", unknownDeliveries: "unknown_deliveries", suppressedDeliveries: "suppressed_deliveries", deferredDeliveries: "deferred_deliveries", unresolvedDeliveries: "unresolved_deliveries", reconciledLeases: "reconciled_leases" } as const satisfies Record<string, AdmissionMessagingMaintenanceMetricKey>;
/** Keeps one current private run per database job; no environment keyring is needed to observe internal work. */
export const ADMISSION_MESSAGING_MAINTENANCE_STORAGE = { table: "admission_messaging_maintenance_progress", scope: "admission_messaging", scopeCheck: "admission_messaging_maintenance_scope_check", versionCheck: "admission_messaging_maintenance_version_check", clockCheck: "admission_messaging_maintenance_clock_check", phaseCheck: "admission_messaging_maintenance_phase_check", stateCheck: "admission_messaging_maintenance_state_check", externalScopeCheck: "admission_messaging_maintenance_external_scope_check", receiptCheck: "admission_messaging_maintenance_receipt_check", queueAgeIndex: "messaging_delivery_queued_age_idx" } as const;
/** Stores only the current private original run, without interpreting a busy response as another acquisition. */
export const ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE = { running: "running", completed: "completed", incomplete: "incomplete" } as const;
/** Names the native protected maintenance entrypoint for hosting drivers. */
export const ADMISSION_MESSAGING_MAINTENANCE_ROUTE = "/api/maintenance/admission-messaging";
/** Names public boundary failures without forwarding an exception or input value. */
export const ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE = { unauthorized: "maintenance_unauthorized", invalidInput: "maintenance_invalid_input", unavailable: "maintenance_unavailable" } as const;
/** Owns safe Spanish API copy under the repository's direct-copy convention. */
export const ADMISSION_MESSAGING_MAINTENANCE_MESSAGE = { unauthorized: "No tenés autorización para ejecutar este mantenimiento.", invalidInput: "El mantenimiento no admite parámetros adicionales.", unavailable: "No se pudo confirmar el resultado del mantenimiento.", completed: "Esta ejecución del mantenimiento quedó completada.", incomplete: "El mantenimiento conservó sus avances y tiene pasos pendientes.", busy: "Ya existe una ejecución de mantenimiento en curso.", unresolved: "Todavía no se pudo confirmar el inicio del mantenimiento." } as const;
/** Fixes correlation and diagnostic ownership without serializing raw causes or provider fields. */
export const ADMISSION_MESSAGING_MAINTENANCE_LOG = { feature: "messaging", operation: "admission_messaging_maintenance", failureMessage: "Admission messaging maintenance operation failed" } as const;
