/** Preserves safe configuration failures and proven progress without publishing private causes. @module messaging-usage-operation-error */
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Own typed outcome for reads, CAS and indeterminate original operations. */
export class MessagingUsageOperationError extends Error {
  /**
   * @param code - Closed messaging outcome, independent of transport status or PostgreSQL text.
   * @param options - Actual private cause and a registered operation id, only when proven.
   */
  constructor(public readonly code: (typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE], options?: ErrorOptions & { operationId?: string }) {
    super(`MessagingUsagePolicy.operation failed: ${code}`, options);
    this.name = "MessagingUsageOperationError";
    this.operationId = options?.operationId;
  }
  readonly operationId: string | undefined;
}
