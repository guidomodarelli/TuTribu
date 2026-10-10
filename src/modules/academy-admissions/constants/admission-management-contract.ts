/** Defines public management contract states without exposing private storage facts. @module admission-management-contract */
/** Names confirmed import-row results independently of validation errors in preview. */
export const ADMISSION_IMPORT_ROW_OUTCOME = { added: "added", unchanged: "unchanged", skipped: "skipped", conflict: "conflict" } as const;
/** Describes a saved temporary preview and its explicit processing lifecycle. */
export const ADMISSION_IMPORT_PUBLIC_STATE = { preview: "preview", processing: "processing", completed: "completed", cancelled: "cancelled", expired: "expired" } as const;
/** Own invitation URLs use a configured origin and the single public token route. */
export const ADMISSION_INVITATION_PUBLIC_PATH_PREFIX = "/admissions/invitations/";
/** Public navigation schemes; provider and caller-selected hosts never choose them. */
export const ADMISSION_PUBLIC_URL_PROTOCOL = { secure: "https:", local: "http:" } as const;
