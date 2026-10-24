/** Names independent protection domains without depending on a runtime constant or crypto adapter. @module messaging-key-purpose */
export type MessagingKeyPurpose = "credential" | "otp_envelope" | "verification_mac" | "invitation_token" | "contact_fingerprint" | "operation_payload";
/** Restricts material attestations to the two HMAC purposes governing protected identity and original intents. */
export type MessagingMacKeyPurpose = "contact_fingerprint" | "operation_payload";
