/** Bounds the disposable-copy lifecycle without changing any product or global test timeout. @module academy-admission-restore-copy-constants */

/** Identifies only uniquely owned restore children; it never authorizes ownership by prefix. */
export const ADMISSION_RESTORE_COPY_NAME_PREFIX = "codex-admission-restore-";
/** Identifies guarded SQL activity without exposing the child connection string. */
export const ADMISSION_RESTORE_DATABASE_OPERATION = "academy_admission_restore_validation";
/** Identifies the receipt written after exact child ownership is established. */
export const ADMISSION_RESTORE_COPY_RECEIPT_PHASE = "owned_restore_copy";
/** Groups safe branch lifecycle receipts for this isolated workflow. */
export const ADMISSION_RESTORE_COPY_WORKFLOW_ID = "academy_admission_restore";
/** Expires an abandoned child after two hours, independently of normal explicit cleanup. */
export const ADMISSION_RESTORE_COPY_TTL_MS = 7_200_000;
/** Bounds one administrative create/restore operation set in milliseconds. */
export const ADMISSION_RESTORE_OPERATION_TIMEOUT_MS = 120_000;
/** Spaces read-only operation observations in milliseconds; mutations are never retried. */
export const ADMISSION_RESTORE_OPERATION_POLL_MS = 250;
/** Bounds only the new native restore scenario, including both disposable branch lifecycles. */
export const ADMISSION_RESTORE_TEST_TIMEOUT_MS = 600_000;

/** Names consumed provider operation discriminators, without validating its full response contract. */
export const ADMISSION_RESTORE_OPERATION_STATUS = {
  finished: "finished", skipped: "skipped", failed: "failed", error: "error", cancelled: "cancelled",
};

/** Describes controlled fixture failures without provider bodies or connection strings. */
export type AdmissionRestoreErrorCode = "restore_ownership_unproven" | "restore_copy_busy" | "restore_copy_closed" | "restore_operation_failed" | "restore_operation_timeout" | "restore_copy_setup_failed" | "restore_copy_cleanup_incomplete" | "restore_copy_creation_unknown";
/** Keeps fixture error codes separate from production admission errors. */
export const ADMISSION_RESTORE_ERROR_CODE = {
  ownershipUnproven: "restore_ownership_unproven", busy: "restore_copy_busy", closed: "restore_copy_closed",
  operationFailed: "restore_operation_failed", timeout: "restore_operation_timeout",
  setupFailed: "restore_copy_setup_failed", cleanupIncomplete: "restore_copy_cleanup_incomplete",
  creationUnknown: "restore_copy_creation_unknown",
} satisfies Record<string, AdmissionRestoreErrorCode>;
