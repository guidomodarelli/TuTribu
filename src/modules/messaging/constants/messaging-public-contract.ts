/** Defines own public messaging vocabulary independently of SDK payload shapes. @module messaging-public-contract */
/** Every supported route identifies an explicitly selected channel. */
export const MESSAGING_PUBLIC_CHANNEL = { email: "email", sms: "sms", whatsapp: "whatsapp" } as const;
/** Credentials are never displayed by prefix/suffix or returned after storage. */
export const MESSAGING_GENERIC_CREDENTIAL_MASK = "••••••••";
/** Reflects own validation metadata; it is not contact or Google authority. */
export const MESSAGING_CREDENTIAL_PUBLIC_STATE = { notValidated: "not_validated", valid: "valid", invalid: "invalid", unavailable: "unavailable" } as const;
/** Own capability preparation does not imply external delivery. */
export const MESSAGING_CAPABILITY_PUBLIC_STATE = { unprepared: "unprepared", prepared: "prepared", unavailable: "unavailable" } as const;
/** A resource's readiness is derived by its adapter rather than exposing the provider object. */
export const MESSAGING_RESOURCE_READINESS = { ready: "ready", incomplete: "incomplete", unavailable: "unavailable" } as const;
/** The first connected provider; unsupported descriptors remain a later registry concern. */
export const MESSAGING_INITIAL_PROVIDER_ID = "zavu";
/** Names successful local verification independently of accepted/delivered receipts. */
export const MESSAGING_VERIFICATION_RESULT = "verified";
