/** Bounds private re-encryption while keeping hosting-key activation separate from BYOK replacement. @module messaging-protection-key-rotation-constants */
export const MESSAGING_PROTECTION_KEY_ROTATION = {
  defaultBatchSize: 25,
  maximumBatchSize: 100,
  operation: "rotate_messaging_protection_keys",
  event: "protection_keys_rotated",
  credentialIndex: "messaging_secret_rotation_idx",
} as const;
