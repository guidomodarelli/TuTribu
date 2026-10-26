/** Starts a bounded private rotation without importing keys or changing provider credentials. @module rotate-messaging-protection-keys-use-case */
import type { MessagingProtectionKeyRotation, MessagingProtectionKeyRotationResult } from "../../domain/repositories/messaging-protection-key-rotation";
import { MessagingProtectionKeyRotationError } from "../../domain/errors/messaging-protection-key-rotation-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_PROTECTION_KEY_ROTATION } from "../../constants/messaging-protection-key-rotation";

/** Leaves current deployment/resource authority, cipher access and atomicity with their private owner. */
export class RotateMessagingProtectionKeysUseCase {
  /** @param rotation - Explicit private backend owner, without a permissive fallback. */
  constructor(private readonly rotation: MessagingProtectionKeyRotation) {}

  /** @param input - Optional backend batch ceiling. @returns Only confirmed aggregate effects. @throws MessagingProtectionKeyRotationError for invalid bounds or an unconfirmed original operation. */
  async execute(input: { limit?: number } = {}): Promise<MessagingProtectionKeyRotationResult> {
    const limit = input.limit ?? MESSAGING_PROTECTION_KEY_ROTATION.defaultBatchSize;
    if (!Number.isInteger(limit) || limit < 1 || limit > MESSAGING_PROTECTION_KEY_ROTATION.maximumBatchSize) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.invalidInput);
    return this.rotation.rotate({ limit });
  }
}
