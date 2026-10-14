/** Reports closed worker diagnostics without raw causes, provider bodies, credentials or dynamic metric labels. @module messaging-observability */
import "server-only";
import type { MessagingDispatchDiagnostic } from "../domain/repositories/message-delivery-sender";
import { MessagingDeliveryStorageError } from "../domain/errors/messaging-delivery-storage-error";
import { MessagingSecretAccessError } from "../domain/errors/messaging-secret-access-error";
import { MessagingDispatchDeadlineError } from "../domain/errors/messaging-dispatch-deadline-error";
import { MESSAGING_ERROR_CODE } from "../constants/messaging-errors";

/** Host composition already binds feature/operation/request/trace; this adapter cannot override that context. */
type MessagingDiagnosticLogger = { error(entry: { message: string; metadata: Record<string, unknown> }): void };
/** @param logger - Native contextual logger with its fixed correlation. @param message - Fixed composition-owned event text. @returns A private runtime reporter selecting only safe diagnostic fields. */
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
    logger.error({ message, metadata: { stage: diagnostic.stage, code, ...(diagnostic.deliveryId ? { deliveryId: diagnostic.deliveryId } : {}), ...(diagnostic.attemptId ? { attemptId: diagnostic.attemptId } : {}) } });
  };
}
