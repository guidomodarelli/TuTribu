/** Defines a private protection-key rotation batch without exposing plaintext or hosting-key material. @module messaging-protection-key-rotation */
import type { MessagingKeyPurpose } from "../value-objects/messaging-key-purpose";

/** Carries deployment identity and key routing metadata without reading/importing crypto material. */
export type MessagingProtectionKeyState = {
  environment: string;
  securityEpoch: string;
  recoveryLocked: boolean;
  keyrings: Readonly<Record<MessagingKeyPurpose, { activeKeyId: string; keyIds: readonly string[] }>>;
};
/** Bounds credential envelopes rather than connections, files or external calls. */
export type MessagingProtectionKeyRotationCommand = { limit: number };
/** Describes confirmed current-scope work; pending OTP material keeps its original short lifetime and key reference. */
export type MessagingProtectionKeyRotationResult = { rotatedCredentials: number; remainingCredentials: boolean; pendingOtpMaterial: boolean };

/** Rotates active cipher protection without replacing provider credentials, identities or usage history. */
export interface MessagingProtectionKeyRotation {
  /** @param command - Backend-owned bounded batch. @returns Aggregate effects only after the original transaction commits. */
  rotate(command: MessagingProtectionKeyRotationCommand): Promise<MessagingProtectionKeyRotationResult>;
}
