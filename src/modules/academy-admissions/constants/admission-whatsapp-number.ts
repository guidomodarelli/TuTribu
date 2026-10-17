/** Names declared-number transitions independently of verification and transport. @module admission-whatsapp-number-constants */
export const ADMISSION_WHATSAPP_CHANGE_OUTCOME = { changed: "changed", unchanged: "unchanged", denied: "denied" } as const;
/** Binds the original declared-number command to its own recoverable ledger namespace. */
export const ADMISSION_WHATSAPP_OPERATION = "update_admission_whatsapp";
/** Validates only the canonical number in own public DTOs, independently of raw-input normalization. */
export const ADMISSION_WHATSAPP_CANONICAL_PATTERN = /^\+[1-9][0-9]{1,14}$/u;
/** Records version lineage without retaining the current or former declared number. */
export const ADMISSION_WHATSAPP_AUDIT_EVENT = "whatsapp_number_changed";
/** Shares the versioned constraint identity with the ORM projection. */
export const ADMISSION_WHATSAPP_NUMBER_CONSTRAINT = "admission_request_whatsapp_number_check";
/** Names the same-origin user action for diagnostics and browser routing. */
export const ADMISSION_WHATSAPP_HTTP_OPERATION = "admission-whatsapp-number-update";
export const ADMISSION_WHATSAPP_ROUTE_SEGMENT = "whatsapp";
