/** Defines one fixed admission maintenance workflow, independent of HTTP, SQL and provider SDKs. @module admission-messaging-maintenance */

/** Keeps the workflow closed; it is not a registry for arbitrary jobs. */
export type AdmissionMessagingMaintenancePhase = "expire_requests" | "purge_admission" | "purge_messaging" | "materialize_reminders" | "prepare_notifications" | "dispatch_outbox" | "reconcile_leases";
/** Distinguishes completed bounded work from omitted configuration, uncertainty and unstarted phases. */
export type AdmissionMessagingMaintenancePhaseStatus = "completed" | "deferred" | "failed" | "unresolved" | "not_configured" | "not_run";
/** Contains only stable operational reasons; provider payloads and exception text are never results. */
export type AdmissionMessagingMaintenanceReason = "authority_unavailable" | "recovery_locked" | "configuration_unavailable" | "operation_unresolved" | "observation_unavailable" | "deadline_reached" | "phase_failed";
/** Labels actual units without mixing requests, rows, credentials or deliveries in one total. */
export type AdmissionMessagingMaintenanceMetricKey = "expired_requests" | "purged_import_rows" | "completed_imports" | "minimized_requests" | "purged_audit_events" | "purged_archived_audit_events" | "expired_candidates" | "purged_candidate_secrets" | "purged_retired_secrets" | "purged_verification_material" | "created_reminders" | "selected_notification_tribes" | "collected_notification_sources" | "prepared_notification_groups" | "claimed_deliveries" | "authorized_deliveries" | "accepted_deliveries" | "delivered_deliveries" | "rejected_deliveries" | "unknown_deliveries" | "suppressed_deliveries" | "deferred_deliveries" | "unresolved_deliveries" | "reconciled_leases";
/** Reports one confirmed count, never a contact, payload, provider reference or secret. */
export type AdmissionMessagingMaintenanceMetric = { readonly key: AdmissionMessagingMaintenanceMetricKey; readonly value: number };
/** A completed bounded batch may still report remaining work; it does not assert global exhaustion. */
export type AdmissionMessagingMaintenancePhaseOutput = { readonly status: AdmissionMessagingMaintenancePhaseStatus; readonly reason: AdmissionMessagingMaintenanceReason | null; readonly metrics: readonly AdmissionMessagingMaintenanceMetric[]; readonly hasRemainingWork: boolean };
/** Separates original work evidence from whether its observation was actually persisted. */
export type AdmissionMessagingMaintenancePhaseSnapshot = Omit<AdmissionMessagingMaintenancePhaseOutput, "status"> & { readonly status: AdmissionMessagingMaintenancePhaseStatus | "running"; readonly phase: AdmissionMessagingMaintenancePhase; readonly startedAtMilliseconds: number | null; readonly durationMilliseconds: number | null; readonly observation: "recorded" | "unavailable" | "pending" | "not_run"; readonly late: boolean };
/** Contains only current key-independent external routing scope, when configured. */
export type AdmissionMessagingMaintenanceExternalScope = { readonly environment: string; readonly securityEpoch: string };
/** Explicitly marks unavailable health; missing queue observations are not zero-length queues. */
export type AdmissionMessagingMaintenanceHealth = { readonly available: boolean; readonly observedAtMilliseconds: number | null; readonly lastSuccessfulRunAtMilliseconds: number | null; readonly oldestQueuedAtMilliseconds: number | null; readonly queueAgeMilliseconds: number | null };
/** Keeps the database's final native deadline classification authoritative for health. */
export type AdmissionMessagingMaintenanceFinish = { readonly health: AdmissionMessagingMaintenanceHealth; readonly completed: boolean; readonly deadlineReached: boolean };
/** Retains a protected original run and its fair first phase, without granting authority to a later effect. */
export type AdmissionMessagingMaintenanceRun = { readonly runId: string; readonly startedAtMilliseconds: number; readonly clockObservedAtMilliseconds?: number; readonly firstPhaseIndex: number; readonly externalScope: AdmissionMessagingMaintenanceExternalScope | null; readonly health: AdmissionMessagingMaintenanceHealth };
/** A busy invocation identifies an existing original; it does not register or start another run. */
export type AdmissionMessagingMaintenanceBeginning = { readonly acquired: true; readonly run: AdmissionMessagingMaintenanceRun } | { readonly acquired: false; readonly existingRunId: string; readonly existingStatus?: "busy" | "completed" | "incomplete"; readonly deadlineReached?: boolean; readonly phases: readonly AdmissionMessagingMaintenancePhaseSnapshot[]; readonly health: AdmissionMessagingMaintenanceHealth };
/** Publishes only safe workflow observations; transport acceptance remains with the outbox owner. */
export type AdmissionMessagingMaintenanceResult = { readonly runId: string | null; readonly status: "completed" | "incomplete" | "busy" | "unresolved"; readonly newRunStarted: boolean; readonly deadlineReached: boolean; readonly observation: "recorded" | "unavailable" | "pending"; readonly phases: readonly AdmissionMessagingMaintenancePhaseSnapshot[]; readonly health: AdmissionMessagingMaintenanceHealth };

/** Each phase composes existing original owners and confirms its own transaction before returning counts. */
export interface AdmissionMessagingMaintenanceWork {
  /** @param phase - One fixed server-owned workflow phase. @param deadlineAtMilliseconds - Original shared host deadline, never extended; it bounds every commit. @param signal - Cancellation for the same original work, never evidence of rollback. @param run - Original private acquisition and external scope; every phase must retain its scope across recovery changes. @param phaseDeadlineAtMilliseconds - Soft deadline of this phase: owners stop starting new steps after it, so one slow phase cannot consume the whole run. @returns Its confirmed minimal output, including mixed results and configuration omissions. */
  runPhase(phase: AdmissionMessagingMaintenancePhase, deadlineAtMilliseconds: number, signal: AbortSignal, run: AdmissionMessagingMaintenanceRun, phaseDeadlineAtMilliseconds?: number): Promise<AdmissionMessagingMaintenancePhaseOutput>;
}
/** Stores one bounded current workflow and native health under current private authority. */
export interface AdmissionMessagingMaintenanceProgress {
  /** @param runId - Fresh server correlation. @returns The confirmed original lease and phase turn, or a genuinely busy original. */
  begin(runId: string): Promise<AdmissionMessagingMaintenanceBeginning>;
  /** @param run - Original acquired run. @param phase - Original settled or unresolved phase evidence; a running snapshot is accepted only while the lease and native deadline are live. @param next - Optional next phase starting in the same commit. @returns After its observations commit; never starts or retries a business effect. */
  recordPhase(run: AdmissionMessagingMaintenanceRun, phase: AdmissionMessagingMaintenancePhaseSnapshot, next?: AdmissionMessagingMaintenancePhaseSnapshot): Promise<void>;
  /** @param run - Original acquired run. @param phases - Original bounded observations. @param deadlineReached - Sticky original deadline evidence. @param observationBudgetMilliseconds - Remaining host budget at its original SQL clock receipt; storage may narrow its native deadline but never extend it. @returns Current native health after recording completion, without inferring success from missing phases. */
  finish(run: AdmissionMessagingMaintenanceRun, phases: readonly AdmissionMessagingMaintenancePhaseSnapshot[], deadlineReached: boolean, observationBudgetMilliseconds?: number): Promise<AdmissionMessagingMaintenanceFinish>;
}
/** Owns host lifetime and diagnostics without importing after(), waitUntil(), a logger or a clock into domain. */
export type AdmissionMessagingMaintenanceRuntime = {
  readonly now: () => number;
  readonly createId: () => string;
  readonly defer: (work: Promise<void>) => void;
  readonly report: (error: unknown, context: { readonly operation: string; readonly runId?: string; readonly phase?: AdmissionMessagingMaintenancePhase }) => void;
};
