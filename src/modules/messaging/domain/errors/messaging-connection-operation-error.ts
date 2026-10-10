/** Preserves a safe connection outcome and proven operation identity without private credential context. @module messaging-connection-operation-error */
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Keeps the domain error independent of application result contracts. */
type MessagingConnectionErrorCode=(typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE];

/** Carries private causes separately from the public connection result. */
export class MessagingConnectionOperationError extends Error {
  /** @param code - Closed semantic outcome. @param options - Actual private cause and a registered original operation id. */
  constructor(public readonly code: MessagingConnectionErrorCode, options?: ErrorOptions & { operationId?:string }) {
    super(`MessagingConnection.operation failed: ${code}`,options);
    this.name="MessagingConnectionOperationError";
    this.operationId=options?.operationId;
  }
  readonly operationId:string|undefined;
}
