/** Names private verification resource and delivery states used before dispatch. @module verification-delivery-constants */
/** Restricts local resend cancellation to a queued obligation without an external marker. */
export const VERIFICATION_DELIVERY_STATE = { queued: "queued", cancelled: "cancelled" } as const;
/** Requires a credential validation acknowledged by the owning integration. */
export const VERIFICATION_CREDENTIAL_STATUS = { valid: "valid" } as const;
/** Separates a tested admission capability from a resource explicitly unavailable for diagnostics. */
export const VERIFICATION_CAPABILITY_STATE = { prepared: "prepared", unavailable: "unavailable" } as const;
/** Closes an unfinished diagnostic when its original challenge is explicitly replaced. */
export const VERIFICATION_DIAGNOSTIC_OUTCOME = { pending: "pending", invalidated: "invalidated" } as const;
/** Identifies the mail channel shared with admission's explicitly selected phone channels. */
export const VERIFICATION_EMAIL_CHANNEL = "email";
