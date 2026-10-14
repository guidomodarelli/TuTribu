/** Preserves known private rotation stops and unconfirmed commits without key or envelope contents. @module messaging-protection-key-rotation-error */
import { MESSAGING_PROTECTION_KEY_ROTATION } from "../../constants/messaging-protection-key-rotation";

/** Keeps protocol outcomes separate from crypto/storage diagnostics and operator-selected key names. */
export type MessagingProtectionKeyRotationErrorCode = "invalid_input" | "permission_denied" | "resource_unavailable" | "operation_unresolved";

/** Identifies the fixed private operation while retaining only a server-side original cause. */
export class MessagingProtectionKeyRotationError extends Error {
  /** @param code - Closed rejection or unconfirmed completion. @param options - Private original diagnostic cause. */
  constructor(public readonly code: MessagingProtectionKeyRotationErrorCode, options?: ErrorOptions) {
    super(`MessagingProtection.${MESSAGING_PROTECTION_KEY_ROTATION.operation} failed: ${code}`, options);
    this.name = new.target.name;
  }
}
