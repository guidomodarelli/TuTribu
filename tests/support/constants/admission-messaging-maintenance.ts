/** Owns small real-timer orchestration fixtures without changing the production deadline. @module admission-messaging-maintenance-test-constants */
import type { AdmissionMessagingMaintenanceMetricKey, AdmissionMessagingMaintenancePhase } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";
import { ADMISSION_MESSAGING_MAINTENANCE_METRIC } from "@/src/modules/messaging/constants/admission-messaging-maintenance";

/** Leaves enough scheduling headroom while proving a real original timeout without fake platform timers. */
export const ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS = 100;
/** Records both original phase start and its settled work result. */
export const ADMISSION_MESSAGING_MAINTENANCE_OBSERVATIONS_PER_PHASE = 2;
/** Keeps each fake own phase's counter in its actual business unit. */
export const ADMISSION_MESSAGING_MAINTENANCE_TEST_METRIC_BY_PHASE = { expire_requests: ADMISSION_MESSAGING_MAINTENANCE_METRIC.expiredRequests, purge_admission: ADMISSION_MESSAGING_MAINTENANCE_METRIC.minimizedRequests, purge_messaging: ADMISSION_MESSAGING_MAINTENANCE_METRIC.purgedRetiredSecrets, materialize_reminders: ADMISSION_MESSAGING_MAINTENANCE_METRIC.createdReminders, prepare_notifications: ADMISSION_MESSAGING_MAINTENANCE_METRIC.collectedNotificationSources, dispatch_outbox: ADMISSION_MESSAGING_MAINTENANCE_METRIC.deliveredDeliveries, reconcile_leases: ADMISSION_MESSAGING_MAINTENANCE_METRIC.reconciledLeases } as const satisfies Record<AdmissionMessagingMaintenancePhase, AdmissionMessagingMaintenanceMetricKey>;
