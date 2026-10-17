/** Preserves private recovery stops and unconfirmed commits without leaking recovered material. @module messaging-recovery-error */
import { MESSAGING_RECOVERY } from "../../constants/messaging-recovery";

/** Restricts recovery outcomes independently of provider or human authentication errors. */
export type MessagingRecoveryErrorCode = "invalid_input" | "permission_denied" | "resource_unavailable" | "operation_unresolved";

/** Retains the original cause exclusively inside the private backend boundary. */
export class MessagingRecoveryError extends Error {
  /** @param code - Known stop or unconfirmed original completion. @param options - Private original diagnostic, never a public DTO. */
  constructor(public readonly code: MessagingRecoveryErrorCode, options?: ErrorOptions) {
    super(`MessagingRecovery.${MESSAGING_RECOVERY.operation} failed: ${code}`, options);
    this.name = new.target.name;
  }
}
