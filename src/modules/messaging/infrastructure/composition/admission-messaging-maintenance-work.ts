/** Adapts existing owner results into safe phase evidence without provider DTOs or human-session impersonation. @module admission-messaging-maintenance-work */
import "server-only";
import type { AdmissionDataRetentionResult } from "@/src/modules/academy-admissions/domain/repositories/admission-data-retention";
import type { AdmissionNotificationProducerResult } from "@/src/modules/notifications/domain/repositories/admission-notification-producer";
import type { MessagingSecretRetentionResult } from "../../domain/repositories/messaging-secret-retention";
import type { MessageDispatchObservedRunResult } from "../../application/results/message-dispatch-observation-result";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import type { AdmissionMessagingMaintenanceMetric, AdmissionMessagingMaintenanceMetricKey, AdmissionMessagingMaintenancePhase, AdmissionMessagingMaintenancePhaseOutput, AdmissionMessagingMaintenanceRun, AdmissionMessagingMaintenanceRuntime, AdmissionMessagingMaintenanceWork } from "../../domain/repositories/admission-messaging-maintenance";
import { AdmissionMessagingMaintenanceError } from "../../domain/errors/admission-messaging-maintenance-error";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";
import { AdmissionExpirationError } from "@/src/modules/academy-admissions/domain/errors/admission-expiration-error";
import { AdmissionRetentionError } from "@/src/modules/academy-admissions/domain/errors/admission-retention-error";
import { MessagingRetentionError } from "../../domain/errors/messaging-retention-error";
import { MessagingDeliveryStorageError } from "../../domain/errors/messaging-delivery-storage-error";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGE_DISPATCH_OBSERVATION_OUTCOME, MESSAGE_DISPATCH_RUN_OUTCOME } from "../../constants/message-dispatch-observation";
import { ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS } from "@/src/modules/notifications/constants/admission-notification-producer";
import { ADMISSION_MESSAGING_MAINTENANCE_METRIC, ADMISSION_MESSAGING_MAINTENANCE_OPERATION, ADMISSION_MESSAGING_MAINTENANCE_PHASE, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS, ADMISSION_MESSAGING_MAINTENANCE_REASON } from "../../constants/admission-messaging-maintenance";

/** Binds concrete original use cases to one current run, deadline and cancellation scope. */
export type AdmissionMessagingMaintenanceOwners = {
  readonly expireRequests: () => Promise<{ expired: number }>;
  readonly purgeAdmission: () => Promise<AdmissionDataRetentionResult>;
  readonly purgeMessaging: () => Promise<MessagingSecretRetentionResult>;
  readonly materializeReminders: () => Promise<{ created: number }>;
  readonly prepareNotifications: () => Promise<AdmissionNotificationProducerResult>;
  readonly dispatchOutbox: () => Promise<MessageDispatchObservedRunResult>;
  readonly reconcileLeases: () => Promise<number>;
};

/** @param key - Fixed semantic counter and its actual unit. @param value - Confirmed own result count. @returns A minimal metric, without copying the owner result or provider fields. */
function metric(key: AdmissionMessagingMaintenanceMetricKey, value: number): AdmissionMessagingMaintenanceMetric { return { key, value }; }

/** @param metrics - Confirmed bounded counts. @param hasRemainingWork - Explicit or conservatively possible remaining work, never a global-empty assertion. @returns A completed bounded phase independently of external receipt certainty. */
function completed(metrics: readonly AdmissionMessagingMaintenanceMetric[], hasRemainingWork = false): AdmissionMessagingMaintenancePhaseOutput {
  return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.completed, reason: null, metrics, hasRemainingWork };
}

/** Uses only own original owner entrypoints; provider lookup and sending remain outside every SQL transaction. */
export class OriginalAdmissionMessagingMaintenanceWork implements AdmissionMessagingMaintenanceWork {
  /** @param createOwners - Per-original composition with guarded independent executors. @param assertRunnable - Short current native lease/scope check, released before any RPC. @param readSecurityConfig - Local own input preflight for external-only phases, never a send permission. @param runtime - Current host deadline and safe private diagnostics. */
  constructor(private readonly createOwners: (run: AdmissionMessagingMaintenanceRun, deadlineAtMilliseconds: number, signal: AbortSignal) => AdmissionMessagingMaintenanceOwners, private readonly assertRunnable: (run: AdmissionMessagingMaintenanceRun) => Promise<void>, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly runtime: AdmissionMessagingMaintenanceRuntime) {}

  /** @param error - Actual own failure, without forwarding raw exception text. @returns A closed configuration, authority or uncertain-phase result; a generic failure never proves rollback. */
  private failed(error: unknown): AdmissionMessagingMaintenancePhaseOutput {
    if (error instanceof AdmissionMessagingMaintenanceError) {
      const status = error.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached ? ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.notRun : error.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable ? ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.notConfigured : error.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable || error.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.recoveryLocked ? ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.failed : ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved;
      return { status, reason: error.reason, metrics: [], hasRemainingWork: true };
    }
    if (error instanceof MessagingCryptographyError) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.notConfigured, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable, metrics: [], hasRemainingWork: true };
    const code = error instanceof AdmissionExpirationError || error instanceof AdmissionRetentionError || error instanceof MessagingRetentionError || error instanceof MessagingDeliveryStorageError || error instanceof MessagingSecretAccessError ? error.code : null;
    if (code === MESSAGING_ERROR_CODE.permissionDenied) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.failed, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable, metrics: [], hasRemainingWork: true };
    if (code === MESSAGING_ERROR_CODE.connectionIncomplete) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.deferred, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable, metrics: [], hasRemainingWork: true };
    return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved, metrics: [], hasRemainingWork: true };
  }

  /** @param result - Original reminder/selection/page/group outcomes, including their confirmed earlier counts. @returns Aggregated safe metrics without treating an unavailable or unstarted part as a successful zero. */
  private notifications(result: AdmissionNotificationProducerResult): AdmissionMessagingMaintenancePhaseOutput {
    const metrics = [metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.selectedNotificationTribes, result.selection.count), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.collectedNotificationSources, result.tribes.reduce((total, tribe) => total + tribe.collection.count, 0)), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.preparedNotificationGroups, result.tribes.reduce((total, tribe) => total + tribe.preparation.count, 0))];
    const steps = [result.selection, ...result.tribes.flatMap((tribe) => [tribe.collection, tribe.preparation])];
    if (steps.some((step) => step.status === ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.unresolved)) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved, metrics, hasRemainingWork: true };
    const failedSteps = steps.filter((step) => step.status === ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.failed);
    if (failedSteps.length) {
      if (failedSteps.some((step) => step.code === ADMISSION_ERROR_CODE.permissionDenied)) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.failed, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable, metrics, hasRemainingWork: true };
      if (failedSteps.every((step) => step.code === ADMISSION_ERROR_CODE.connectionIncomplete)) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.notConfigured, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable, metrics, hasRemainingWork: true };
      return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.failed, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.phaseFailed, metrics, hasRemainingWork: true };
    }
    if (result.stoppedAtDeadline || steps.some((step) => step.status === ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.notRun)) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.deferred, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached, metrics, hasRemainingWork: true };
    if (steps.some((step) => step.status === ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.deferred)) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.deferred, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable, metrics, hasRemainingWork: true };
    return completed(metrics, result.limitReached || result.tribes.some((tribe) => tribe.hasContinuation !== false));
  }

  /** @param result - Observed original dispatcher counts and its independent observer state. @returns Operational phase evidence; accepted/unknown transport remains explicitly counted rather than relabeled as receipt. */
  private dispatch(result: MessageDispatchObservedRunResult): AdmissionMessagingMaintenancePhaseOutput {
    const metrics = [metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.claimedDeliveries, result.claimed), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.authorizedDeliveries, result.authorized), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.acceptedDeliveries, result.accepted), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.deliveredDeliveries, result.delivered), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.rejectedDeliveries, result.rejected), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.unknownDeliveries, result.unknown), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.suppressedDeliveries, result.suppressed), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.deferredDeliveries, result.quotaDeferred), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.unresolvedDeliveries, result.unresolved)];
    if (result.observationOutcome === MESSAGE_DISPATCH_OBSERVATION_OUTCOME.unavailable) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.observationUnavailable, metrics, hasRemainingWork: true };
    if (result.workerOutcome !== MESSAGE_DISPATCH_RUN_OUTCOME.completed) return { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved, reason: result.deadlineReached ? ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached : ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved, metrics, hasRemainingWork: true };
    return completed(metrics, result.quotaDeferred > 0 || result.unresolved > 0 || result.unknown > 0 || result.claimed > 0);
  }

  /** @param phase - Fixed actual owner. @param deadlineAtMilliseconds - Original shared host deadline. @param signal - The same original cancellation. @param run - Original acquired scope, rechecked before every owner transaction. @returns Confirmed own counters and explicit omitted/uncertain work without retrying a phase. */
  async runPhase(phase: AdmissionMessagingMaintenancePhase, deadlineAtMilliseconds: number, signal: AbortSignal, run: AdmissionMessagingMaintenanceRun): Promise<AdmissionMessagingMaintenancePhaseOutput> {
    try {
      if (signal.aborted || this.runtime.now() >= deadlineAtMilliseconds) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached);
      await this.assertRunnable(run);
      if (phase === ADMISSION_MESSAGING_MAINTENANCE_PHASE.dispatch) await this.readSecurityConfig();
      if (signal.aborted || this.runtime.now() >= deadlineAtMilliseconds) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached);
      const owners = this.createOwners(run, deadlineAtMilliseconds, signal);
      switch (phase) {
        case ADMISSION_MESSAGING_MAINTENANCE_PHASE.expiration: { const result = await owners.expireRequests(); return completed([metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.expiredRequests, result.expired)], result.expired > 0); }
        case ADMISSION_MESSAGING_MAINTENANCE_PHASE.admissionRetention: { const result = await owners.purgeAdmission(); return completed([metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.purgedImportRows, result.importMaterial.purgedRows), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.completedImports, result.importMaterial.completedImports), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.minimizedRequests, result.privateData.requestsMinimized), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.purgedAuditEvents, result.privateData.auditEventsPurged), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.purgedArchivedAuditEvents, result.privateData.archivedAuditEventsPurged)], result.privateData.remainingRequests || result.privateData.remainingAuditEvents || result.importMaterial.purgedRows > 0); }
        case ADMISSION_MESSAGING_MAINTENANCE_PHASE.messagingRetention: { const result = await owners.purgeMessaging(); return completed([metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.expiredCandidates, result.candidates.expired), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.purgedCandidateSecrets, result.candidates.purgedImmediately), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.purgedRetiredSecrets, result.retiredSecretsPurged), metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.purgedVerificationMaterial, result.verificationMaterialPurged)], result.candidates.expired > 0 || result.retiredSecretsPurged > 0 || result.verificationMaterialPurged > 0); }
        case ADMISSION_MESSAGING_MAINTENANCE_PHASE.reminders: { const result = await owners.materializeReminders(); return completed([metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.createdReminders, result.created)], result.created > 0); }
        case ADMISSION_MESSAGING_MAINTENANCE_PHASE.notifications: return this.notifications(await owners.prepareNotifications());
        case ADMISSION_MESSAGING_MAINTENANCE_PHASE.dispatch: return this.dispatch(await owners.dispatchOutbox());
        case ADMISSION_MESSAGING_MAINTENANCE_PHASE.reconciliation: { const count = await owners.reconcileLeases(); return completed([metric(ADMISSION_MESSAGING_MAINTENANCE_METRIC.reconciledLeases, count)], count > 0); }
      }
    } catch (error) {
      this.runtime.report(error, { operation: ADMISSION_MESSAGING_MAINTENANCE_OPERATION.phase, runId: run.runId, phase });
      return this.failed(error);
    }
  }
}
