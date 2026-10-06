/** Names portable cryptographic parameters and private, closed failure codes. */
export const MESSAGING_CRYPTO = {
  aesAlgorithm: "AES-GCM", macAlgorithm: "HMAC", macHash: "SHA-256",
  keyBytes: 32, ivBytes: 12, tagBits: 128, envelopeFormat: 1,
  aadDomain: "tutribu.messaging.secret.v1", macDomain: "tutribu.admission.code.v1",
} as const;
export const MESSAGING_KEY_PURPOSE = {
  credential: "credential", otpEnvelope: "otp_envelope", verificationMac: "verification_mac",
  invitationToken: "invitation_token", contactFingerprint: "contact_fingerprint", operationPayload: "operation_payload",
} as const;
export const MESSAGING_CRYPTO_ERROR = {
  invalidConfiguration: "messaging_crypto_configuration_invalid", reusedKey: "messaging_crypto_key_reused",
  keyUnavailable: "messaging_crypto_key_unavailable", recoveryLocked: "messaging_crypto_recovery_locked",
  contextMismatch: "messaging_crypto_context_mismatch", authenticationFailed: "messaging_crypto_authentication_failed",
  materialExpired: "messaging_crypto_material_expired",
} as const;
