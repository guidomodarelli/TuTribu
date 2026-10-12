/** Declares closed aggregate dimensions independently of runtime constant values. @module admission-metric-dimensions */
/** Stable public workflow dimensions are declared explicitly instead of derived from runtime constants. */
export type AdmissionMetricPhase = "admission" | "review" | "verification" | "dispatch" | "retention" | "notification" | "claim" | "authorize" | "prepare" | "send" | "complete" | "late" | "defer";
/** Describes a completed job category, without granting permission to run it. */
export type AdmissionMetricRunOperation = "messaging_dispatch" | "admission_expiration" | "admission_retention" | "notification_materialization";

/** Contains one fixed contact channel, never a contact/account label. */
export type AdmissionMetricChannel = "email" | "sms" | "whatsapp";
