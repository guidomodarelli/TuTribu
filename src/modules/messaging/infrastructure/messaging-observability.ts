/** Reports closed worker and maintenance diagnostics without raw causes, provider bodies, credentials or dynamic metric labels. @module messaging-observability */
import "server-only";
import type { MessagingDispatchDiagnostic } from "../domain/repositories/message-delivery-sender";
import type { AdmissionMessagingMaintenanceRuntime } from "../domain/repositories/admission-messaging-maintenance";
import { MessagingDeliveryStorageError } from "../domain/errors/messaging-delivery-storage-error";
import { MessagingSecretAccessError } from "../domain/errors/messaging-secret-access-error";
import { MessagingDispatchDeadlineError } from "../domain/errors/messaging-dispatch-deadline-error";
import { findAdmissionMessagingMaintenanceError } from "../domain/errors/admission-messaging-maintenance-error";
import { MessagingCryptographyError } from "./encryption/messaging-cryptography-error";
import { MESSAGING_ERROR_CODE } from "../constants/messaging-errors";
import { ADMISSION_MESSAGING_MAINTENANCE_REASON } from "../constants/admission-messaging-maintenance";
import { summarizeErrorCauses } from "@/src/modules/shared/infrastructure/observability/error-cause-summary";

/** Host composition already binds feature/operation/request/trace; this adapter cannot override that context. */
type MessagingDiagnosticLogger = { error(entry: { message: string; metadata: Record<string, unknown> }): void };
/** @param logger - Native contextual logger with its fixed correlation. @param message - Fixed composition-owned event text. @returns A private runtime reporter selecting only safe diagnostic fields and the cause chain's class names and closed codes. */
export function createMessagingDispatchReporter(logger: MessagingDiagnosticLogger, message: string): (diagnostic: MessagingDispatchDiagnostic) => void {
  const reported = new WeakMap<object, Set<string>>();
  return (diagnostic) => {
    const code = diagnostic.cause instanceof MessagingDeliveryStorageError || diagnostic.cause instanceof MessagingSecretAccessError || diagnostic.cause instanceof MessagingDispatchDeadlineError ? diagnostic.cause.code : MESSAGING_ERROR_CODE.unexpectedFailure;
    if (typeof diagnostic.cause === "object" && diagnostic.cause !== null) {
      const identity = JSON.stringify([diagnostic.stage, diagnostic.deliveryId ?? null, diagnostic.attemptId ?? null]);
      const seen = reported.get(diagnostic.cause) ?? new Set<string>();
      if (seen.has(identity)) return;
      seen.add(identity); reported.set(diagnostic.cause, seen);
    }
    const causes = summarizeErrorCauses(diagnostic.cause);
    logger.error({ message, metadata: { stage: diagnostic.stage, code, ...(diagnostic.deliveryId ? { deliveryId: diagnostic.deliveryId } : {}), ...(diagnostic.attemptId ? { attemptId: diagnostic.attemptId } : {}), ...(causes.length > 0 ? { causes } : {}) } });
  };
}

/** @param error - Failure reported by the maintenance workflow. @returns Closed reason logged for it, including a guard rejection wrapped by an owner, never the raw error text. */
function resolveMaintenanceFailureReason(error: unknown) {
  const maintenanceError = findAdmissionMessagingMaintenanceError(error);
  if (maintenanceError) return maintenanceError.reason;
  if (error instanceof MessagingCryptographyError) return ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable;
  return ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved;
}

/**
 * @param logger - Native contextual logger with the run's correlation.
 * @param message - Fixed composition-owned event text.
 * @returns The maintenance runtime reporter: the closed reason, run and phase plus the cause chain (class names, own codes and SQLSTATE), so an operator can tell why a phase stopped.
 */
export function createAdmissionMaintenanceFailureReporter(logger: MessagingDiagnosticLogger, message: string): AdmissionMessagingMaintenanceRuntime["report"] {
  return (error, diagnostic) => {
    const causes = summarizeErrorCauses(error);
    logger.error({ message, metadata: { operation: diagnostic.operation, reason: resolveMaintenanceFailureReason(error), ...(diagnostic.runId ? { runId: diagnostic.runId } : {}), ...(diagnostic.phase ? { phase: diagnostic.phase } : {}), ...(causes.length > 0 ? { causes } : {}) } });
  };
}
