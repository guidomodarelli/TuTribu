/** Names ledger intents and irreversible local resend effects. @module verification-issuance-constants */
/** Separates initial issuance and explicit replacement in the actor/tenant operation namespace. */
export const VERIFICATION_ISSUANCE_OPERATION = { issue: "issue_contact_challenge", resend: "resend_contact_challenge" } as const;
/** Distinguishes a stored local issuance from a closed business denial. */
export const VERIFICATION_ISSUANCE_OUTCOME = { denied: "denied", issued: "issued" } as const;
/** Records the deliberate replacement cause without treating it as an external-send cancellation. */
export const VERIFICATION_RESEND_REASON = "explicit_resend";
/** Separates the protected verification-delivery tuple from other operation payloads. */
export const VERIFICATION_FROZEN_PAYLOAD_DOMAIN = "contact_verification_delivery_v1";
/** Versions the private frozen payload shape independently of resource and policy versions. */
export const VERIFICATION_FROZEN_PAYLOAD_FORMAT = 1;
/** Serializes the current challenge namespace without upgrading shared tribe locks. */
export const VERIFICATION_ISSUANCE_LOCK_DOMAIN = "contact_verification_issuance";
