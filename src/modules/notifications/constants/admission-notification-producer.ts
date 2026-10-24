/** Owns the bounded admission producer's private contracts and scheduling defaults. @module admission-notification-producer-constants */
import type { AdmissionNotificationProducerStepStatus } from "../domain/repositories/admission-notification-producer";

/** Bounds one portable invocation; the hosting owner supplies its existing shared deadline separately. */
export const ADMISSION_NOTIFICATION_PRODUCER_LIMITS = { tribes: 4, groupsPerTribe: 10, reminders: 50 } as const;
/** Classifies confirmed work, temporary omission and uncertain persistence separately. */
export const ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS = { completed: "completed", deferred: "deferred", failed: "failed", unresolved: "unresolved", notRun: "not_run" } as const satisfies Record<string, AdmissionNotificationProducerStepStatus>;
/** Names only safe logging phases; complete intents and private configuration are never report metadata. */
export const ADMISSION_NOTIFICATION_PRODUCER_PHASE = { selection: "selection", reminders: "reminders", collection: "collection", preparation: "preparation" } as const;
/** Keeps fair selection independent of keys, recipient eligibility and provider availability. */
export const ADMISSION_NOTIFICATION_PRODUCER_PROGRESS_STORAGE = { table: "admission_notification_producer_progress", versionCheck: "admission_notification_producer_progress_version_check", clockCheck: "admission_notification_producer_progress_clock_check" } as const;
