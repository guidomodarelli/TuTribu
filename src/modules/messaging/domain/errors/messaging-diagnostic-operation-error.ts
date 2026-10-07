/** Preserves an owner's closed operation failure without exposing private causes or verification intent. @module messaging-diagnostic-operation-error */
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Keeps the domain outcome independent of application response contracts. */
type MessagingDiagnosticErrorCode = (typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE];

/** Carries a registered operation identity only when completion is genuinely indeterminate. */
export class MessagingDiagnosticOperationError extends Error {
  /**
   * @param code - Closed messaging outcome, never a raw PostgreSQL or provider message.
   * @param options - Actual private cause and an operation id proven by the original ledger.
   */
  constructor(public readonly code: MessagingDiagnosticErrorCode, options?: ErrorOptions & { operationId?: string }) {
    super(`ConnectionDiagnostic.verify failed: ${code}`, options);
    this.name = "MessagingDiagnosticOperationError";
    this.operationId = options?.operationId;
  }
  readonly operationId: string | undefined;
}
