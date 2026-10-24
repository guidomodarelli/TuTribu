/** Bounds private request expiration independently from provider delivery and public input. @module admission-expiration-constants */
export const ADMISSION_EXPIRATION_BATCH_LIMIT = { default: 50, maximum: 100 } as const;

/** Names the fixed backend operation for authorization and private diagnostics. */
export const ADMISSION_EXPIRATION_OPERATION = "expire_admission_requests";
