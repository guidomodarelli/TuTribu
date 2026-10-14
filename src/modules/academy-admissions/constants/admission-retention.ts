/** Bounds private temporary-file minimization independently of CSV size and public pagination. @module admission-retention-constants */
/** Counts rows rather than whole files so a large import cannot multiply the batch ceiling. */
export const ADMISSION_IMPORT_MATERIAL_RETENTION = { defaultRowLimit: 500, maximumRowLimit: 2_000, operation: "purge_allowlist_import_material" } as const;
/** Identifies the atomic batch across temporary imports, terminal contents and security audit. */
export const ADMISSION_DATA_RETENTION_OPERATION = "purge_admission_data";
/** Bounds two independent private owners; SQL owns their authoritative retention clocks. */
export const ADMISSION_PRIVATE_DATA_RETENTION = {
  defaultRequestLimit: 100,
  maximumRequestLimit: 500,
  defaultAuditLimit: 500,
  maximumAuditLimit: 2_000,
  operation: "purge_admission_private_data",
  requestRule: "minimize_terminal_admission_requests",
  auditRule: "purge_admission_security_audit",
  requestIndex: "admission_request_private_retention_idx",
  decisionIndex: "admission_decision_retention_idx",
  requestMinimizationCheck: "admission_request_private_minimization_check",
  auditIndex: "admission_audit_retention_idx",
  archivedAuditIndex: "retired_admission_audit_retention_idx",
} as const;
