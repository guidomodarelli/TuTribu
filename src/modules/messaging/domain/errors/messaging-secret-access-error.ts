/** Represents a closed private secret-access failure independently of HTTP or crypto implementations. */
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

export type MessagingSecretAccessErrorCode = typeof MESSAGING_ERROR_CODE.authenticationRequired | typeof MESSAGING_ERROR_CODE.permissionDenied | typeof MESSAGING_ERROR_CODE.resourceUnavailable | typeof MESSAGING_ERROR_CODE.reauthenticationRequired | typeof MESSAGING_ERROR_CODE.connectionIncomplete | typeof MESSAGING_ERROR_CODE.unexpectedFailure;

/** Keeps diagnostic causes private while giving application a stable authorization outcome. */
export class MessagingSecretAccessError extends Error {
  /**
   * Constructs an operation-specific failure without retaining credential or envelope metadata.
   * @param code - Closed semantic outcome for the caller's boundary.
   * @param options - Original private exception when an adapter actually threw.
   */
  constructor(public readonly code: MessagingSecretAccessErrorCode, options?: ErrorOptions) {
    super(`MessagingSecretStore.loadAuthorizedSecret failed: ${code}`, options);
    this.name = "MessagingSecretAccessError";
  }
}
