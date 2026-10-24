/** Keeps cryptographic diagnostics private; consumers map only stable codes to safe DTOs. */
import type { MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";

/** Represents a closed crypto/configuration failure without serializing material or context. */
export class MessagingCryptographyError extends Error {
  readonly code: (typeof MESSAGING_CRYPTO_ERROR)[keyof typeof MESSAGING_CRYPTO_ERROR];

  /**
   * Constructs a safe operation diagnostic, retaining only a real internal cause.
   * @param code - Stable failure category; no provider copy or secret value.
   * @param options - Native Error options, never forwarded to public results.
   */
  constructor(code: MessagingCryptographyError["code"], options?: ErrorOptions) {
    super(`MessagingCryptography failed: ${code}`, options);
    this.name = "MessagingCryptographyError";
    this.code = code;
  }
}
